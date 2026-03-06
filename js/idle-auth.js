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

  // ─── Detect placeholder / unconfigured Firebase config ───────────────────
  function _isPlaceholderConfig() {
    return FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY';
  }

  // ─── Firebase initialisation ─────────────────────────────────────────────
  function initAuth(callback) {
    if (_initialized) {
      if (typeof callback === 'function') callback(null, _currentUser);
      return;
    }

    // Short-circuit immediately if the config is still placeholder values.
    // This avoids a 10-second timeout and keeps the game playable offline.
    if (_isPlaceholderConfig()) {
      _initialized = true;
      console.info('[GameAuth] Firebase config not set — cloud save unavailable, playing locally.');
      if (typeof callback === 'function') {
        callback(new Error('Firebase not configured — playing locally'), null);
      }
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

    // If Firebase is not configured show a friendly notice instead of broken sign-in buttons.
    if (_isPlaceholderConfig()) {
      var noticeOverlay = document.createElement('div');
      noticeOverlay.id = 'game-auth-overlay';
      noticeOverlay.style.cssText = [
        'position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,0.92);display:flex;align-items:center;',
        'justify-content:center;z-index:99999;font-family:inherit;'
      ].join('');

      var noticeModal = document.createElement('div');
      noticeModal.style.cssText = [
        'background:linear-gradient(135deg,#1e3a5f 0%,#0d1f3a 100%);',
        'border:5px solid #FFD700;border-radius:12px;',
        'padding:28px 24px;max-width:360px;width:90%;text-align:center;',
        'color:#fff;',
        'box-shadow:0 0 40px rgba(255,215,0,0.5),inset 0 0 30px rgba(0,0,0,0.3);',
        'font-family:inherit;'
      ].join('');

      noticeModal.innerHTML = [
        '<div style="font-size:52px;margin-bottom:6px;">💧</div>',
        '<h2 style="margin:0 0 4px;color:#FFD700;font-family:\'Bangers\',cursive;font-size:2em;',
        'text-shadow:2px 2px 0 #000,-1px -1px 0 #000;letter-spacing:2px;">WATER DROP SURVIVOR</h2>',
        '<div style="background:#fffde7;border:3px solid #000;border-radius:10px;padding:10px 14px;',
        'color:#1a0f0a;font-size:13px;line-height:1.5;text-align:left;margin:12px 0 16px;',
        'box-shadow:2px 2px 0 #000;">',
        '⚠️ Cloud save not configured — playing locally.',
        '</div>',
        '<button id="auth-skip-btn" style="',
        'background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;',
        'border:3px solid #000;border-radius:6px;padding:10px 24px;',
        'cursor:pointer;font-size:16px;font-family:\'Bangers\',cursive;',
        'letter-spacing:1px;box-shadow:3px 3px 0 #000;">',
        '▶ PLAY LOCALLY</button>'
      ].join('');

      noticeOverlay.appendChild(noticeModal);
      document.body.appendChild(noticeOverlay);

      document.getElementById('auth-skip-btn').addEventListener('click', function () {
        var ov = document.getElementById('game-auth-overlay');
        if (ov) ov.parentNode.removeChild(ov);
        if (typeof onComplete === 'function') onComplete(null);
      });
      return;
    }

    // Build overlay — uses the game's "welcome droplet text menu box" aesthetic
    var overlay = document.createElement('div');
    overlay.id = 'game-auth-overlay';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:rgba(0,0,0,0.92);display:flex;align-items:center;',
      'justify-content:center;z-index:99999;font-family:inherit;'
    ].join('');

    var modal = document.createElement('div');
    modal.style.cssText = [
      'background:linear-gradient(135deg,#1e3a5f 0%,#0d1f3a 100%);',
      'border:5px solid #FFD700;border-radius:12px;',
      'padding:28px 24px;max-width:360px;width:90%;text-align:center;',
      'color:#fff;',
      'box-shadow:0 0 40px rgba(255,215,0,0.5),inset 0 0 30px rgba(0,0,0,0.3);',
      'font-family:inherit;'
    ].join('');

    modal.innerHTML = [
      '<div style="font-size:52px;margin-bottom:6px;">💧</div>',
      '<h2 style="margin:0 0 4px;color:#FFD700;font-family:\'Bangers\',cursive;font-size:2em;',
      'text-shadow:2px 2px 0 #000,-1px -1px 0 #000;letter-spacing:2px;">WATER DROP SURVIVOR</h2>',
      // NPC speech-bubble style info text
      '<div style="background:#fffde7;border:3px solid #000;border-radius:10px;padding:10px 14px;',
      'color:#1a0f0a;font-size:13px;line-height:1.5;text-align:left;margin:12px 0 16px;',
      'box-shadow:2px 2px 0 #000;position:relative;">',
      '☁️ Sign in to save your progress and sync across devices!',
      '</div>',
      // Google button — keep branding, wrap in thematic style
      '<button id="auth-google-btn" style="',
      'width:100%;padding:11px;margin-bottom:10px;border-radius:6px;',
      'background:#fff;color:#444;font-size:15px;cursor:pointer;',
      'border:3px solid #000;box-shadow:2px 2px 0 #000;font-weight:bold;',
      'display:flex;align-items:center;justify-content:center;gap:8px;">',
      '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" ',
      'width="20" height="20" alt="" onerror="this.style.display=\'none\'">',
      'Sign in with Google</button>',
      // Apple button — keep branding
      '<button id="auth-apple-btn" style="',
      'width:100%;padding:11px;margin-bottom:16px;border-radius:6px;',
      'background:#000;color:#fff;font-size:15px;cursor:pointer;',
      'border:3px solid #FFD700;box-shadow:2px 2px 0 #000;font-weight:bold;',
      'display:flex;align-items:center;justify-content:center;gap:8px;">',
      '<span style="font-size:20px;line-height:1;"> </span>',
      'Sign in with Apple</button>',
      // Yellow "Play without account" OK button matching game style
      '<button id="auth-skip-btn" style="',
      'background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;',
      'border:3px solid #000;border-radius:6px;padding:10px 24px;',
      'cursor:pointer;font-size:16px;font-family:\'Bangers\',cursive;',
      'letter-spacing:1px;box-shadow:3px 3px 0 #000;">',
      '▶ PLAY WITHOUT ACCOUNT</button>',
      '<div id="auth-error-msg" style="color:#FF4500;font-size:13px;margin-top:10px;min-height:18px;font-family:Arial,sans-serif;"></div>'
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

    // After a successful login, persist the provider's display name into the game profile
    function _applyProviderName(user) {
      if (!user) return;
      var displayName = user.displayName ||
        (user.providerData && user.providerData[0] && user.providerData[0].displayName) ||
        '';
      if (displayName && window.GameAccount && window.GameState && window.GameState.saveData) {
        window.GameAccount.setProfileName(displayName, window.GameState.saveData);
      }
    }

    document.getElementById('auth-google-btn').addEventListener('click', function () {
      _showError('');
      signInWithGoogle(function (err, user) {
        if (err) { _showError('Google sign-in failed: ' + err.message); return; }
        _applyProviderName(user);
        _dismiss(user);
      });
    });

    document.getElementById('auth-apple-btn').addEventListener('click', function () {
      _showError('');
      signInWithApple(function (err, user) {
        if (err) { _showError('Apple sign-in failed: ' + err.message); return; }
        _applyProviderName(user);
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
    renderAuthUI: renderAuthUI,
    _isPlaceholderConfig: _isPlaceholderConfig
  };
})();
