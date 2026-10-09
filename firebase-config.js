/*
  firebase-config.js
  ربط الموقع بفايربيز: تسجيل دخول المالك + حفظ التيشرتات أونلاين.
  لو سيبت القيم دي زي ما هي، الموقع هيشتغل عادي من ملف products.js.

  بعد ما تعمل مشروع فايربيز (الخطوات اللي بعتهالك)، الصق هنا الإعدادات
  اللي بتظهرلك في: Project settings > Your apps > Web app > firebaseConfig

  ------------------------------------------------------------
  قواعد Firestore (الصقها في Firestore > Rules > Publish)
  غيّر الإيميل لإيميلك إنت:

  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /store/{doc} {
        allow read: if true;
        allow write: if request.auth != null
                     && request.auth.token.email == "اكتب-ايميلك-هنا@gmail.com";
      }
    }
  }
  ------------------------------------------------------------
*/
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
