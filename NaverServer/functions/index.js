const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');

const firebaseAdmin = require('firebase-admin');

const requestMeUrl = 'https://openapi.naver.com/v1/nid/me';

firebaseAdmin.initializeApp(functions.config().firebase);

/** * requestMe - Returns user profile from Naver API * * 
 * @param {String} NaverAccessToken Access token retrieved by Naver Login API * 
 * @return {Promiise<Response>} User profile response in a promise */
function requestMe(NaverAccessToken) {
    console.log('Requesting user profile from Naver API server.');
    return request({
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + NaverAccessToken },
        url: requestMeUrl,
    });
};

/** * updateOrCreateUser - Update Firebase user with the give email, create if * none exists. * *
 * @param {String} userId user id per app * 
 * @param {String} email user's email address * 
 * @param {String} displayName user * 
 * @param {String} photoURL profile photo url * 
 * @return {Prommise<UserRecord>} Firebase user record in a promise */

function updateOrCreateUser(userId, email, displayName, photoURL) {
    console.log('updating or creating a firebase user');
    const updateParams = { provider: 'Naver', displayName: displayName, photoURL: photoURL, };
    if (photoURL) { updateParams['photoURL'] = photoURL; }
    return firebaseAdmin.auth().updateUser(userId, updateParams)
        .catch((error) => {
            if (error.code === 'auth/user-not-found') {
                updateParams['uid'] = userId;
                if (email) { updateParams['email'] = email; }
                return firebaseAdmin.auth().createUser(updateParams);
            }
            throw error;
        });
};

/** * createFirebaseToken - returns Firebase token using Firebase Admin SDK * * /
 * @param {String} NaverAccessToken access token from Naver Login API *
 * @return {Promise<String>} Firebase token in a promise */
function createFirebaseToken(NaverAccessToken) {
    return requestMe(NaverAccessToken).then((response) => {
        
        const body = JSON.parse(response);
        console.log('response:', response);
        const userId = `Naver:${body.response.id}`;
        if (!userId) {
            return res.status(404).send({ message: 'There was no user with the given access token.' });
        }
        return updateOrCreateUser(userId, body.response.email, body.response.nickname, body.response.profile_image);
    })
        .then((userRecord) => {
            const userId = userRecord.uid; console.log(`creating a custom firebase token based on uid ${userId}`);
            return firebaseAdmin.auth().createCustomToken(userId, { provider: 'Naver' });
        });
};

const app = express(); app.use(bodyParser.json());
app.get('/', (req, res) => res.status(200).send('NaverLoginServer for Firebase is up and running!'));
app.post('/verifyToken', (req, res) => {
    const token = req.body.token; 
    if (!token) return res.status(400)
        .send({ message: 'Access token is a required parameter.' });
    createFirebaseToken(token)
        .then((firebaseToken) => {
            console.log(`Returning firebase token to user: ${firebaseToken}`);
            res.send({ firebase_token: firebaseToken });
        });
}); // Start the server


exports.naverApp = functions.https.onRequest(app);


