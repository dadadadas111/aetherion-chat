const admin = require('firebase-admin');

let firestore = null;

function initializeFirebase() {
  try {
    // Get Firebase credentials from environment variable
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountJson) {
      console.log('FIREBASE_SERVICE_ACCOUNT not set. Chat server will run without Firebase (friend chat history disabled)');
      return null;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    firestore = admin.firestore();
    console.log('Firebase initialized successfully');
    return firestore;
  } catch (error) {
    console.error('Error initializing Firebase:', error.message);
    console.log('Chat server will run without Firebase (friend chat history disabled)');
    return null;
  }
}

function getFirestore() {
  return firestore;
}

module.exports = {
  initializeFirebase,
  getFirestore
};
