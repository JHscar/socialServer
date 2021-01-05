const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');

const firebaseAdmin = require('firebase-admin');

// 유저 정보를 불러오기 위한 요청 URL 
const requestMeUrl = 'https://kapi.kakao.com/v2/user/me';

// 'npm install --save firebase-admin'
// firebase-admin Auth createUser를 생성하기 위해 설정
firebaseAdmin.initializeApp(functions.config().firebase);

/** * requestMe - Returns user profile from Kakao API * * 
 * @param {String} kakaoAccessToken Access token retrieved by Kakao Login API * 
 * @return {Promiise<Response>} User profile response in a promise */
function requestMe(kakaoAccessToken) {
    console.log('Requesting user profile from Kakao API server.');

    // 4. KAKAO의 유저 정보를 가져오기 위해 토큰 값과 상단의 requestMeUrl을 카카오 서버에 요청한다.
    return request({
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + kakaoAccessToken },
        url: requestMeUrl,
    });
};

/** * updateOrCreateUser - Update Firebase user with the give email, create if * none exists. * *
 * @param {String} userId user id per app * 
 * @param {String} email user's email address * 
 * @param {String} displayName user * 
 * @param {String} photoURL profile photo url * 
 * @return {Prommise<UserRecord>} Firebase user record in a promise */

 // 유저 id 있다면 업데이트 , 유저 id 없다면 생성을 해주는 코드
function updateOrCreateUser(userId, email, displayName, photoURL) {
    console.log('updating or creating a firebase user');

    console.log('userId', userId);
    console.log('email', email);
    console.log('displayName', displayName);
    console.log('photoURL', photoURL);

    const randomNum = Math.floor(Math.random() * 1000001); // 랜덤 변수는 써도되고 안써도 된다. (DB를 어떻게 설계하느냐에 따라 다르다.)
    
    const updateParams = { provider: 'KAKAO', displayName: displayName, photoURL: photoURL, }; // 업데이트 or 생성을 할때 등록하는 데이터

    if (photoURL) { updateParams['photoURL'] = photoURL; }

    // 8. 유저 id가 존재 할 경우 유저를 업데이트 시켜주는 코드이다.
    return firebaseAdmin.auth().updateUser(userId, updateParams)
        .catch((error) => {

            // 존재 하지 않을 경우 나오는 에러 코드이다. 존재 하지 않으므로 createUser로 생성을 해주고 데이터들을 등록해준다.
            if (error.code === 'auth/user-not-found') {
                console.log('USER-NOT-FOUND');
                updateParams['uid'] = userId + randomNum;
                if (email) { updateParams['email'] = email; }
                return firebaseAdmin.auth().createUser(updateParams);
            }
            throw error;
        });
};

async function userInfo(uidCheck) {
    // 6. 전달 받은 유저 id를 Firestore 회원들의 정보들이 담긴 collection에 이미 가입되어있는지 확인을 하기 위해서다.
    return await new Promise((resolve, reject) => {
        firebaseAdmin.firestore().collection('users').where('provider', '==', 'KAKAO').get().then(querySnapshot => {
            querySnapshot.forEach(doc => {
                if (doc.data().uid.indexOf(uidCheck) == 0) {
                    console.log('Doc', doc.data());
                    resolve(doc.data().uid);
                }
            });
            reject(uidCheck);
        });
    })
}

/** * createFirebaseToken - returns Firebase token using Firebase Admin SDK * * /
 * @param {String} kakaoAccessToken access token from Kakao Login API *
 * @return {Promise<String>} Firebase token in a promise */

// 토큰 값이 있을 경우 firebaseToken 생성하는 함수 코드
function createFirebaseToken(kakaoAccessToken) {
    // 3. requestMe에 토큰 값을 전달해서 정보를 불러온다.
    return requestMe(kakaoAccessToken).then((response) => {
        console.log('이곳에 관한 정보', response);
        const body = JSON.parse(response);

        // requestMe를 통해서 응답받은 정보에는 유저id가 담겨있다. (앞에 kakao라고 입력한 이유는 가입경로를 구분하기 위해서다.)
        const userId = `kakao:${body.id}`;

        // 유저 id가 없을 경우 404에러와 메세지를 프론트에 전달해준다.
        if (!userId) {
            return res.status(404).send({ message: 'There was no user with the given access token.' });
        }
        
        // 5. 유저 id가 있을 경우 userInfo()에 id 값을 전달한다.
        return userInfo(userId).then((success) => {
            // 7. 유저 id가 등록이 안 되어있을 경우
            return updateOrCreateUser(success, body.kaccount_email, body.properties.nickname, body.properties.profile_image)
        }).catch((err) => {
            // 유저 id가 등록이 되어있을 경우
            return updateOrCreateUser(err, body.kaccount_email, body.properties.nickname, body.properties.profile_image);
        });
    })
        .then((userRecord) => {
            const userId = userRecord.uid; console.log(`creating a custom firebase token based on uid ${userId}`);
            return firebaseAdmin.auth().createCustomToken(userId, { provider: 'KAKAO' });
        });
};


// 1. [시작 서버] 처음에 프론트엔드 코드에서 요청보낸 값(accessToken)을 가져오는 코드.
const app = express(); app.use(bodyParser.json());
app.get('/', (req, res) => res.status(200).send('KakaoLoginServer for Firebase is up and running!'));
app.post('/verifyToken', (req, res) => {

    // 요청받은 토큰 값을 변수에 담아준다. (이유는 간편하게 쓰기 위해)
    const token = req.body.token;
    
    // 토큰 값이 없을 경우 400에러를 프론트에 메세지와 함께 보내준다.  
    if (!token) return res.status(400)
        .send({ message: 'Access token is a required parameter.' });

    // 2. 토큰 값이 있을 경우 createFirebaseToken() 함수에 전달한다.
    createFirebaseToken(token)
        .then((firebaseToken) => {
            console.log(`Returning firebase token to user: ${firebaseToken}`);

            // 9. 모든 과정을 진행하고 createUser 또는 updateUser를 통해 firebaseToken값을 프로튼엔드에다가 전달 해준다.
            res.send({ firebase_token: firebaseToken });
        });
}); // Start the server


exports.app = functions.https.onRequest(app);


