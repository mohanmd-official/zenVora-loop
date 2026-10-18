// Zenvora Loop: Firebase connection settings.
//
// Firebase console → ⚙ Project settings → General → "Your apps" → Web app (</>) → "SDK setup and configuration" → Config.
// Copy the four values below from there and push to GitHub.
//
// These values are meant to be public (every Firebase website ships them). Your data is protected by
// sign-in plus the Firestore security rules (firestore.rules), not by hiding this file.
// While the values still say PASTE, the app runs in "Local mode" (no sign-in, data stays in the browser).
window.ZL_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_APP_ID"
};

// The administrator: can create, disable and remove users.
// If you change it, change the same email in firestore.rules too.
window.ZL_ADMIN_EMAIL = "mohanmd.official@gmail.com";
