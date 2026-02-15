/**
 * Content Script - Runs on all web pages
 * Handles text selection and shows "Verify Claim" button
 */

let verifyButton = null;
let verifyPopup = null;
let currentSelection = '';

// Create the floating verify button
function createVerifyButton() {
  if (verifyButton) return verifyButton;
  
  verifyButton = document.createElement('div');
  verifyButton.id = 'claim-verifier-button';
  verifyButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5 7.5C15.5 11.6421 12.1421 15 8 15C3.85786 15 0.5 11.6421 0.5 7.5C0.5 3.35786 3.85786 0 8 0C12.1421 0 15.5 3.35786 15.5 7.5Z" stroke="white" stroke-width="1"/>
      <path d="M8 4V8L11 10" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>Verify Claim</span>
  `;
  verifyButton.style.display = 'none';
  document.body.appendChild(verifyButton);
  
  verifyButton.addEventListener('click', handleVerifyClick);
  
  return verifyButton;
}

// Create the results popup
function createResultsPopup() {
  if (verifyPopup) return verifyPopup;
  
  verifyPopup = document.createElement('div');
  verifyPopup.id = 'claim-verifier-popup';
  verifyPopup.style.display = 'none';
  document.body.appendChild(verifyPopup);
  
  return verifyPopup;
}

// Handle text selection
document.addEventListener('mouseup', (e) => {
  // Don't interfere with clicks on our own UI
  if (e.target.closest('#claim-verifier-button') || 
      e.target.closest('#claim-verifier-popup')) {
    return;
  }
  
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 10 && text.length < 1000) {
      currentSelection = text;
      showVerifyButton(e.pageX, e.pageY);
    } else {
      hideVerifyButton();
    }
  }, 10);
});

// Hide button when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#claim-verifier-button') && 
      !e.target.closest('#claim-verifier-popup')) {
    hideVerifyButton();
    hideResultsPopup();
  }
});

// Show the verify button near the selection
function showVerifyButton(x, y) {
  const button = createVerifyButton();
  button.style.left = `${x}px`;
  button.style.top = `${y + 20}px`;
  button.style.display = 'flex';
}

// Hide the verify button
function hideVerifyButton() {
  if (verifyButton) {
    verifyButton.style.display = 'none';
  }
}

// Handle verify button click
async function handleVerifyClick() {
  if (!currentSelection) return;
  
  hideVerifyButton();
  showLoadingPopup();
  
  try {
    // Send message to background script to verify claim
    chrome.runtime.sendMessage({
      action: 'verifyClaim',
      claim: currentSelection
    }, (response) => {
      if (response.error) {
        showErrorPopup(response.error);
      } else {
        showResultsPopup(response);
      }
    });
  } catch (error) {
    showErrorPopup(error.message);
  }
}

// Show loading state
function showLoadingPopup() {
  const popup = createResultsPopup();
  popup.innerHTML = `
    <div class="claim-verifier-header">
      <div class="claim-verifier-title">🔍 Verifying Claim...</div>
      <button class="claim-verifier-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
    </div>
    <div class="claim-verifier-content">
      <div class="claim-verifier-loading">
        <div class="claim-verifier-spinner"></div>
        <p>Analyzing claim and gathering evidence...</p>
      </div>
    </div>
  `;
  
  // Position popup
  const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top = `${rect.bottom + window.scrollY + 10}px`;
  popup.style.display = 'block';
}

// Show error
function showErrorPopup(error) {
  const popup = createResultsPopup();
  popup.innerHTML = `
    <div class="claim-verifier-header">
      <div class="claim-verifier-title">❌ Error</div>
      <button class="claim-verifier-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
    </div>
    <div class="claim-verifier-content">
      <div class="claim-verifier-error">
        <p><strong>Verification failed:</strong></p>
        <p>${error}</p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
          Make sure the backend server is running at <code>http://localhost:3000</code>
        </p>
      </div>
    </div>
  `;
  popup.style.display = 'block';
}

// Show verification results
function showResultsPopup(result) {
  const popup = createResultsPopup();
  
  // Determine verdict styling
  const verdictClass = result.verdict.toLowerCase().replace(/_/g, '-');
  const verdictIcons = {
    'true': '✅',
    'false': '❌',
    'partially-true': '⚠️',
    'not-enough-evidence': '❓'
  };
  const icon = verdictIcons[verdictClass] || '❓';
  const verdictText = result.verdict.replace(/_/g, ' ');
  
  // Build citations HTML
  let citationsHTML = '';
  if (result.citations && result.citations.length > 0) {
    citationsHTML = `
      <div class="claim-verifier-citations">
        <h4>📚 Sources:</h4>
        ${result.citations.map((citation) => `
          <div class="claim-verifier-citation">
            <div class="claim-verifier-citation-title">
              [${citation.index}] ${citation.title}
            </div>
            <a href="${citation.url}" target="_blank" class="claim-verifier-citation-url">
              ${citation.url}
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  popup.innerHTML = `
    <div class="claim-verifier-header">
      <div class="claim-verifier-title">🔍 Claim Verification</div>
      <button class="claim-verifier-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
    </div>
    <div class="claim-verifier-content">
      <div class="claim-verifier-verdict claim-verifier-verdict-${verdictClass}">
        <span class="claim-verifier-verdict-icon">${icon}</span>
        <span class="claim-verifier-verdict-text">${verdictText}</span>
        <span class="claim-verifier-confidence">${(result.confidence * 100).toFixed(0)}%</span>
      </div>
      
      <div class="claim-verifier-claim">
        <strong>Claim:</strong> "${currentSelection}"
      </div>
      
      <div class="claim-verifier-reasoning">
        <h4>💭 Analysis:</h4>
        <p>${result.reasoning}</p>
      </div>
      
      ${citationsHTML}
      
      <div class="claim-verifier-footer">
        <span>⏱️ ${result.processingTime}</span>
        <button onclick="navigator.clipboard.writeText('${currentSelection}\\n\\nVerdict: ${verdictText}\\nConfidence: ${(result.confidence * 100).toFixed(0)}%\\n\\n${result.reasoning.replace(/'/g, "\\'")}')">
          📋 Copy Results
        </button>
      </div>
    </div>
  `;
  
  popup.style.display = 'block';
}

// Hide results popup
function hideResultsPopup() {
  if (verifyPopup) {
    verifyPopup.style.display = 'none';
  }
}

// Initialize
createVerifyButton();
createResultsPopup();

// Listen for keyboard shortcut (Ctrl/Cmd + Shift + V)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
    const selection = window.getSelection().toString().trim();
    if (selection.length > 10) {
      currentSelection = selection;
      handleVerifyClick();
    }
  }
});

console.log('🔍 Claim Verifier extension loaded');
