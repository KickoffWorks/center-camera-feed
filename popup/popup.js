document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const status = document.getElementById('status');
  const sourceGroup = document.getElementById('sourceGroup');
  const positionGrid = document.getElementById('positionGrid');
  const resetPosition = document.getElementById('resetPosition');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeValue = document.getElementById('sizeValue');

  // Load saved state
  const result = await chrome.storage.local.get([
    'enabled',
    'position',
    'videoSource',
    'videoSize'
  ]);

  toggle.checked = result.enabled || false;
  updateLabel(toggle.checked);

  // Set initial values
  const currentPosition = result.position || 'top-center';
  const currentSource = result.videoSource || 'self';
  const currentSize = result.videoSize || 200;

  // Update UI to reflect saved settings
  updatePositionUI(currentPosition);
  updateSourceUI(currentSource);
  sizeSlider.value = currentSize;
  sizeValue.textContent = currentSize;

  // Check if we're on a supported page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const supportedDomains = [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'webex.com',
    'discord.com'
  ];

  const isSupported = tab.url && supportedDomains.some(domain => tab.url.includes(domain));

  if (isSupported) {
    status.textContent = 'Ready to center your video feed!';
    status.classList.add('active');
  } else {
    status.textContent = 'Open a supported video call to use this extension.';
    toggle.disabled = true;
  }

  // Handle enable toggle
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;

    await chrome.storage.local.set({ enabled });
    updateLabel(enabled);

    if (isSupported) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle', enabled });
        status.textContent = enabled ? 'Video feed centered!' : 'Video feed hidden.';
        status.classList.toggle('active', enabled);
        status.classList.remove('error');
      } catch (e) {
        status.textContent = 'Please refresh the page and try again.';
        status.classList.add('error');
        status.classList.remove('active');
      }
    }
  });

  // Handle video source selection
  sourceGroup.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-option');
    if (!btn) return;

    const value = btn.dataset.value;
    updateSourceUI(value);

    await chrome.storage.local.set({ videoSource: value });

    if (isSupported && toggle.checked) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          settings: { videoSource: value }
        });
      } catch (e) {
        // Content script not ready
      }
    }
  });

  // Handle position selection
  positionGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pos-btn');
    if (!btn) return;

    const value = btn.dataset.value;
    updatePositionUI(value);

    await chrome.storage.local.set({ position: value });
    await chrome.storage.local.remove('customPosition');

    if (isSupported && toggle.checked) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          settings: { position: value }
        });
      } catch (e) {
        // Content script not ready
      }
    }
  });

  // Handle reset position
  resetPosition.addEventListener('click', async () => {
    await chrome.storage.local.remove('customPosition');

    if (isSupported && toggle.checked) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'resetPosition' });
      } catch (e) {
        // Content script not ready
      }
    }
  });

  // Handle size slider
  let sizeTimeout;
  sizeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    sizeValue.textContent = value;

    // Debounce the save and message
    clearTimeout(sizeTimeout);
    sizeTimeout = setTimeout(async () => {
      await chrome.storage.local.set({ videoSize: value });

      if (isSupported && toggle.checked) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'updateSettings',
            settings: { videoSize: value }
          });
        } catch (e) {
          // Content script not ready
        }
      }
    }, 100);
  });

  function updateLabel(enabled) {
    toggleLabel.textContent = enabled ? 'Enabled' : 'Disabled';
  }

  function updatePositionUI(position) {
    positionGrid.querySelectorAll('.pos-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === position);
    });
  }

  function updateSourceUI(source) {
    sourceGroup.querySelectorAll('.btn-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === source);
    });
  }
});
