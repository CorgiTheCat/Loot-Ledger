const manifestUrl = new URL('/manifest.json', window.location.origin).href;
const input = document.querySelector('#install-url');
input.value = manifestUrl;
document.querySelector('#view-manifest').href = manifestUrl;
document.querySelector('#copy-install').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(manifestUrl);
    status.textContent = 'Install link copied.';
  } catch {
    input.focus();
    input.select();
    status.textContent = 'Select and copy the install link above.';
  }
});
