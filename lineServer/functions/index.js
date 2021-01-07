const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');

const firebaseAdmin = require('firebase-admin');

const imageUrl = 'https://www.kindpng.com/picc/m/78-785827_user-profile-avatar-login-account-male-user-icon.png'

firebaseAdmin.initializeApp(functions.config().firebase);

/** * updateOrCreateUser - Update Firebase user with the give email, create if * none exists. * *
 * @param {String} userId user id per app * 
 * @param {String} email user's email address * 
 * @param {String} displayName user * 
 * @param {String} photoURL profile photo url * 
 * @return {Prommise<UserRecord>} Firebase user record in a promise */

 // Firebase Auth 사용자 생성 or 업데이트
function updateOrCreateUser(userId, email, displayName, photoURL) {
    const updateParams = { provider: 'LINE', displayName: displayName, photoURL: photoURL };
    if (photoURL) { updateParams['photoURL'] = imageUrl; }

    // 3. Firebase Auth에 userId가 동일하게 있다면 updateUser로 정보를 업데이트를 해준다.
    return firebaseAdmin.auth().updateUser(userId, updateParams)
        .catch((error) => {
            // Auth에 userId가 존재하지 않을 경우 뜨는 에러
            if (error.code === 'auth/user-not-found') {
                updateParams['uid'] = userId;
                if (email) { updateParams['email'] = email; }

                // userId가 존재하지 않아서 createUser로 정보 생성을 해준다.
                return firebaseAdmin.auth().createUser(updateParams);
            }
            throw error;
        });
        
};

/** * createFirebaseToken - returns Firebase token using Firebase Admin SDK * * /
 * @param {String} LineAccessToken access token from Line Login API *
 * @return {Promise<String>} Firebase token in a promise */

// FirebaseToken생성 함수
function createFirebaseToken(authid, email, displayname) {
        const userId = `line:${authid}`;

        // userId가 없거나 or undefined면 404 Error 메세지를 보낸다.
        if (!userId) {
            return res.status(404).send({ message: 'There was no user with the given access token.' });
          }
            // 2. userId가 있으면 업데이트 or 생성을 해준다.
            return updateOrCreateUser(userId, email, displayname, imageUrl).then(()=>{

              // User정보의 Token값을 생성해준다.
              return firebaseAdmin.auth().createCustomToken(userId, { provider: 'LINE' })
          });
};

// LINE에게 발급받은 ID 대신 사용 랜덤id 발급해주는 함수
function lineuserid() {
  var length = 20;
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

const app = express(); app.use(bodyParser.json());
app.get('/', (req, res) => res.status(200).send('LINEserver for Firebase is up and running!'));

// 프론트에서 요청을 보내면 응답을해줘야한다.
app.post('/verifyToken', (req, res) => {
    const token = req.body.token ? lineuserid() : '';
    const email = req.body.email;
    const displayname = req.body.displayName;

    // LINE ID값이 없을 경우 - 400 Error 메세지를 보낸다.
    if (!token) return res.status(400)
        .send({ message: 'Access token is a required parameter.' });

    // 1. LINE ID값이 있을 경우 - Firebase Auth에 사용자 생성 후 생성된 User Token값을 보낸다.
    createFirebaseToken(token, email, displayname)
        .then((firebaseToken) => {
            res.send({ firebase_token: firebaseToken });
        });
}); // Start the server


exports.linelogin = functions.https.onRequest(app);