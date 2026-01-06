document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const status = document.getElementById('status');

  // Load saved state
  const result = await chrome.storage.local.get(['enabled']);
  toggle.checked = result.enabled || false;
  updateLabel(toggle.checked);

  // Check if we're on a supported page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const supportedDomains = [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'webex.com',
    'discord.com'
  ];

  const isSupported = supportedDomains.some(domain => tab.url?.includes(domain));

  if (isSupported) {
    status.textContent = 'Ready to center your camera feed!';
    status.classList.add('active');
  } else {
    status.textContent = 'Open a supported video call to use this extension.';
    toggle.disabled = true;
  }

  // Handle toggle
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;

    // Save state
    await chrome.storage.local.set({ enabled });
    updateLabel(enabled);

    // Send message to content script
    if (isSupported) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle', enabled });
        status.textContent = enabled ? 'Camera feed centered!' : 'Camera feed restored.';
        status.classList.toggle('active', enabled);
      } catch (e) {
        status.textContent = 'Please refresh the page and try again.';
        status.classList.add('error');
        status.classList.remove('active');
      }
    }
  });

  function updateLabel(enabled) {
    toggleLabel.textContent = enabled ? 'Enabled' : 'Disabled';
  }
});
