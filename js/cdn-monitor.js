    // Monitor font loading and log errors gracefully
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        console.log('[CDN] Fonts loaded successfully');
      }).catch((error) => {
        console.warn('[CDN] Font loading failed, using fallback fonts:', error);
      });
    }

    // Listen for resource errors (images, scripts, stylesheets)
    window.addEventListener('error', function(event) {
      if (event.target !== window) {
        const resourceUrl = event.target.src || event.target.href || 'unknown';
        if (resourceUrl.includes('fonts.googleapis.com') || resourceUrl.includes('fonts.gstatic.com')) {
          console.warn('[CDN] Font resource failed to load:', resourceUrl, '- using system fonts');
        } else if (resourceUrl.includes('unpkg.com')) {
          console.warn('[CDN] CDN resource failed to load:', resourceUrl, '- attempting graceful degradation');
        } else if (resourceUrl !== 'unknown') {
          console.warn('[CDN] Resource failed to load:', resourceUrl);
        }
        // Don't show blocking alerts, just log
      }
    }, true);

    // Override default error handler to prevent blocking alerts
    window.addEventListener('unhandledrejection', function(event) {
      console.error('[Error] Unhandled promise rejection:', event.reason);
      event.preventDefault(); // Prevent default alert behavior
    });
