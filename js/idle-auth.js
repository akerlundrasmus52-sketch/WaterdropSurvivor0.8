// idle-auth.js — Firebase Authentication module (Google & Apple Sign-In)
// Exposes window.GameAuth

window.GameAuth = (function () {
  // ─── Firebase configuration ───────────────────────────────────────────────
  // Replace these placeholder values with your project's real Firebase config.
  var FIREBASE_CONFIG = {
    apiKey:            'YOUR_API_KEY',
    authDomain:        'YOUR_AUTH_DOMAIN',
    projectId:         'YOUR_PROJECT_ID',
    storageBucket:     'YOUR_STORAGE_BUCKET',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId:             'YOUR_APP_ID'
  };

  // Firebase SDK version loaded via CDN
  var FIREBASE_SDK_VERSION = '10.12.2';

  var _app  = null;
  var _auth = null;
  var _db   = null;
  var _currentUser = null;
  var _initialized = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _loadScript(src, onLoad, onError) {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = src;
    s.onload = onLoad || null;
    s.onerror = onError || null;
    document.head.appendChild(s);
  }

  // ─── Firebase initialisation ─────────────────────────────────────────────
  function initAuth(callback) {
    if (_initialized) {
      if (typeof callback === 'function') callback(null, _currentUser);
      return;
    }

    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/';

    // Dynamically import Firebase modular SDK
    var script = document.createElement('script');
    script.type = 'module';
    script.textContent = [
      'import { initializeApp }            from "' + base + 'firebase-app.js";',
      'import { getAuth, onAuthStateChanged, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut as fbSignOut } from "' + base + 'firebase-auth.js";',
      'import { getFirestore, doc, setDoc, getDoc } from "' + base + 'firebase-firestore.js";',
      'var app  = initializeApp(' + JSON.stringify(FIREBASE_CONFIG) + ');',
      'var auth = getAuth(app);',
      'var db   = getFirestore(app);',
      'window._GameAuthInternals = {',
      '  app: app, auth: auth, db: db,',
      '  GoogleAuthProvider: GoogleAuthProvider,',
      '  OAuthProvider: OAuthProvider,',
      '  signInWithPopup: signInWithPopup,',
      '  fbSignOut: fbSignOut,',
      '  onAuthStateChanged: onAuthStateChanged,',
      '  doc: doc, setDoc: setDoc, getDoc: getDoc',
      '};',
      'window._GameAuthInternalsReady = true;'
    ].join('\n');

    script.onerror = function () {
      console.warn('[GameAuth] Firebase SDK failed to load. Auth will be unavailable.');
      _initialized = true;
      if (typeof callback === 'function') callback(new Error('Firebase SDK load failed'), null);
    };

    document.head.appendChild(script);

    // Poll until the module sets the ready flag
    var attempts = 0;
    var maxAttempts = 100;
    var poll = setInterval(function () {
      attempts++;
      if (window._GameAuthInternals && window._GameAuthInternalsReady) {
        clearInterval(poll);
        _app  = window._GameAuthInternals.app;
        _auth = window._GameAuthInternals.auth;
        _db   = window._GameAuthInternals.db;
        _initialized = true;

        // Listen for auth state changes
        window._GameAuthInternals.onAuthStateChanged(window._GameAuthInternals.auth, function (user) {
          _currentUser = user || null;
        });

        if (typeof callback === 'function') callback(null, _currentUser);
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        _initialized = true;
        console.warn('[GameAuth] Timed out waiting for Firebase SDK.');
        if (typeof callback === 'function') callback(new Error('Firebase init timeout'), null);
      }
    }, 100);
  }

  // ─── Auth methods ─────────────────────────────────────────────────────────
  function signInWithGoogle(callback) {
    if (!_initialized || !window._GameAuthInternals) {
      if (typeof callback === 'function') callback(new Error('Auth not initialized'), null);
      return;
    }
    var intern = window._GameAuthInternals;
    var provider = new intern.GoogleAuthProvider();
    intern.signInWithPopup(intern.auth, provider)
      .then(function (result) {
        _currentUser = result.user;
        if (typeof callback === 'function') callback(null, result.user);
      })
      .catch(function (err) {
        if (typeof callback === 'function') callback(err, null);
      });
  }

  function signInWithApple(callback) {
    if (!_initialized || !window._GameAuthInternals) {
      if (typeof callback === 'function') callback(new Error('Auth not initialized'), null);
      return;
    }
    var intern = window._GameAuthInternals;
    var provider = new intern.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    intern.signInWithPopup(intern.auth, provider)
      .then(function (result) {
        _currentUser = result.user;
        if (typeof callback === 'function') callback(null, result.user);
      })
      .catch(function (err) {
        if (typeof callback === 'function') callback(err, null);
      });
  }

  function signOut(callback) {
    if (!_initialized || !window._GameAuthInternals) {
      if (typeof callback === 'function') callback(null);
      return;
    }
    window._GameAuthInternals.fbSignOut(window._GameAuthInternals.auth)
      .then(function () {
        _currentUser = null;
        if (typeof callback === 'function') callback(null);
      })
      .catch(function (err) {
        if (typeof callback === 'function') callback(err);
      });
  }

  function getCurrentUser() {
    return _currentUser;
  }

  // ─── Firestore cloud save ─────────────────────────────────────────────────
  // Only persist known top-level keys to prevent unexpected data from being stored.
  var _SAVE_KEYS = [
    'gold', 'playerLevel', 'stats', 'idle', 'clicker', 'expeditions',
    'prestige', 'achievements', 'gems', 'shop', 'wheel', 'dailies',
    'account', 'statistics', 'essence', 'activeBuffs'
  ];

  function _sanitizeSave(saveData) {
    var safe = {};
    for (var i = 0; i < _SAVE_KEYS.length; i++) {
      var k = _SAVE_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(saveData, k)) {
        safe[k] = saveData[k];
      }
    }
    return safe;
  }

  function saveToCloud(saveData, callback) {
    if (!_currentUser || !window._GameAuthInternals) {
      if (typeof callback === 'function') callback(new Error('Not signed in'));
      return;
    }
    var intern = window._GameAuthInternals;
    var ref = intern.doc(intern.db, 'players', _currentUser.uid);
    intern.setDoc(ref, { uid: _currentUser.uid, saveData: _sanitizeSave(saveData), updatedAt: Date.now() })
      .then(function () { if (typeof callback === 'function') callback(null); })
      .catch(function (err) { if (typeof callback === 'function') callback(err); });
  }

  function loadFromCloud(callback) {
    if (!_currentUser || !window._GameAuthInternals) {
      if (typeof callback === 'function') callback(new Error('Not signed in'), null);
      return;
    }
    var intern = window._GameAuthInternals;
    var ref = intern.doc(intern.db, 'players', _currentUser.uid);
    intern.getDoc(ref)
      .then(function (snap) {
        if (snap.exists()) {
          if (typeof callback === 'function') callback(null, snap.data().saveData || null);
        } else {
          if (typeof callback === 'function') callback(null, null);
        }
      })
      .catch(function (err) { if (typeof callback === 'function') callback(err, null); });
  }

  // ─── Auth UI ──────────────────────────────────────────────────────────────
  function renderAuthUI(onComplete) {
    if (getCurrentUser()) {
      if (typeof onComplete === 'function') onComplete(getCurrentUser());
      return;
    }

    // Build overlay
    var overlay = document.createElement('div');
    overlay.id = 'game-auth-overlay';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:rgba(10,10,30,0.92);display:flex;align-items:center;',
      'justify-content:center;z-index:99999;font-family:inherit;'
    ].join('');

    var modal = document.createElement('div');
    modal.style.cssText = [
      'background:#1a1a2e;border:2px solid #5DADE2;border-radius:14px;',
      'padding:32px 28px;max-width:360px;width:90%;text-align:center;',
      'color:#e0e0e0;box-shadow:0 8px 40px rgba(0,0,0,0.6);'
    ].join('');

    modal.innerHTML = [
      '<div style="font-size:48px;margin-bottom:8px;">💧</div>',
      '<h2 style="margin:0 0 6px;color:#5DADE2;">Water Drop Survivor</h2>',
      '<p style="color:#aaa;font-size:14px;margin:0 0 22px;">',
      'Sign in to save your progress and sync across devices.',
      '</p>',
      '<button id="auth-google-btn" style="',
      'width:100%;padding:12px;margin-bottom:10px;border-radius:8px;',
      'border:none;background:#4285F4;color:#fff;font-size:16px;cursor:pointer;">',
      '🔑 Sign in with Google</button>',
      '<button id="auth-apple-btn" style="',
      'width:100%;padding:12px;margin-bottom:18px;border-radius:8px;',
      'border:none;background:#222;color:#fff;font-size:16px;cursor:pointer;">',
      ' Sign in with Apple</button>',
      '<button id="auth-skip-btn" style="',
      'background:transparent;border:1px solid #555;color:#aaa;',
      'padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;">',
      'Play without account</button>',
      '<div id="auth-error-msg" style="color:#e74c3c;font-size:13px;margin-top:12px;min-height:18px;"></div>'
    ].join('');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function _showError(msg) {
      var el = document.getElementById('auth-error-msg');
      if (el) el.textContent = _esc(msg);
    }

    function _dismiss(user) {
      var ov = document.getElementById('game-auth-overlay');
      if (ov) ov.parentNode.removeChild(ov);
      if (typeof onComplete === 'function') onComplete(user || null);
    }

    document.getElementById('auth-google-btn').addEventListener('click', function () {
      signInWithGoogle(function (err, user) {
        if (err) { _showError('Google sign-in failed: ' + err.message); return; }
        _dismiss(user);
      });
    });

    document.getElementById('auth-apple-btn').addEventListener('click', function () {
      signInWithApple(function (err, user) {
        if (err) { _showError('Apple sign-in failed: ' + err.message); return; }
        _dismiss(user);
      });
    });

    document.getElementById('auth-skip-btn').addEventListener('click', function () {
      _dismiss(null);
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    initAuth: initAuth,
    signInWithGoogle: signInWithGoogle,
    signInWithApple: signInWithApple,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    saveToCloud: saveToCloud,
    loadFromCloud: loadFromCloud,
    renderAuthUI: renderAuthUI
  };
})();
