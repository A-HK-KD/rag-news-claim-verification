/**
 * Popup Script
 * Handles the extension popup UI and interactions
 */

const API_URL = 'http://localhost:3000/api/verify';
const HEALTH_URL = 'http://localhost:3000/health';

// Check server status on load
checkServerStatus();

// Verify button click handler
document.getElementById('verifyButton').addEventListener('click', async () => {
  const claim = document.getElementById('claimInput').value.trim();
  
  if (!claim) {
    showError('Please enter a claim to verify');
    return;
  }
  
  if (claim.length < 10) {
    showError('Claim is too short. Please provide more context.');
    return;
  }
  
  await verifyClaim(claim);
});

// Allow Enter with Ctrl/Cmd to submit
document.getElementById('claimInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    document.getElementById('verifyButton').click();
  }
});

// History link
document.getElementById('historyLink').addEventListener('click', (e) => {
  e.preventDefault();
  showHistory();
});

// Verify claim function
async function verifyClaim(claim) {
  showLoading();
  hideResult();
  hideError();
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        claim: claim,
        useWebSearch: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Store in history
    await storeVerification(claim, result);
    
    // Display result
    displayResult(result, claim);
    
  } catch (error) {
    console.error('Verification error:', error);
    showError(`Verification failed: ${error.message}. Make sure the backend server is running at http://localhost:3000`);
  } finally {
    hideLoading();
  }
}

// Display verification result
function displayResult(result, claim) {
  const resultDiv = document.getElementById('result');
  
  // Determine verdict class and icon
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
      <div class="result-citations">
        <h4>📚 Sources:</h4>
        ${result.citations.map((citation) => `
          <div class="citation-item">
            <div class="citation-title">[${citation.index}] ${citation.title}</div>
            <a href="${citation.url}" target="_blank" class="citation-link">${citation.url}</a>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  resultDiv.innerHTML = `
    <div class="verdict-badge verdict-${verdictClass}">
      <span class="verdict-icon">${icon}</span>
      <span>${verdictText}</span>
      <span class="verdict-confidence">${(result.confidence * 100).toFixed(0)}%</span>
    </div>
    
    <div class="result-reasoning">
      <h4>💭 Analysis:</h4>
      <p>${result.reasoning}</p>
    </div>
    
    ${citationsHTML}
    
    <div class="result-footer">
      <span>⏱️ ${result.processingTime}</span>
      <button class="copy-button" onclick="copyResults('${claim.replace(/'/g, "\\'")}', '${verdictText}', ${result.confidence}, '${result.reasoning.replace(/'/g, "\\'")}')">
        📋 Copy
      </button>
    </div>
  `;
  
  resultDiv.style.display = 'block';
}

// Copy results to clipboard
window.copyResults = function(claim, verdict, confidence, reasoning) {
  const text = `Claim: "${claim}"\n\nVerdict: ${verdict}\nConfidence: ${(confidence * 100).toFixed(0)}%\n\nAnalysis: ${reasoning}`;
  
  navigator.clipboard.writeText(text).then(() => {
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '✓ Copied!';
    setTimeout(() => {
      button.innerHTML = originalText;
    }, 2000);
  });
};

// Show/hide UI elements
function showLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('verifyButton').disabled = true;
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('verifyButton').disabled = false;
}

function showResult() {
  document.getElementById('result').style.display = 'block';
}

function hideResult() {
  document.getElementById('result').style.display = 'none';
}

function showError(message) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `
    <div class="error-message">
      <strong>Error:</strong>
      <span>${message}</span>
    </div>
  `;
  resultDiv.style.display = 'block';
}

function hideError() {
  // Errors are shown in result div, so hiding result hides errors
}

// Check server status
async function checkServerStatus() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('statusText');
  
  try {
    const response = await fetch(HEALTH_URL, { method: 'GET' });
    if (response.ok) {
      statusDot.classList.add('online');
      statusText.textContent = 'Backend connected';
    } else {
      throw new Error('Server not responding');
    }
  } catch (error) {
    statusDot.classList.add('offline');
    statusText.textContent = 'Backend offline';
  }
}

// Store verification in history
async function storeVerification(claim, result) {
  try {
    const { verifications = [] } = await chrome.storage.local.get('verifications');
    
    verifications.unshift({
      claim: claim,
      verdict: result.verdict,
      confidence: result.confidence,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 20
    if (verifications.length > 20) {
      verifications.pop();
    }
    
    await chrome.storage.local.set({ verifications });
  } catch (error) {
    console.error('Failed to store verification:', error);
  }
}

// Show history
async function showHistory() {
  try {
    const { verifications = [] } = await chrome.storage.local.get('verifications');
    
    if (verifications.length === 0) {
      showError('No verification history yet');
      return;
    }
    
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
      <div class="result-reasoning">
        <h4>📜 Recent Verifications:</h4>
        ${verifications.slice(0, 10).map((v, i) => {
          const verdict = v.verdict.replace(/_/g, ' ');
          const verdictClass = v.verdict.toLowerCase().replace(/_/g, '-');
          const date = new Date(v.timestamp).toLocaleString();
          return `
            <div class="citation-item">
              <div class="citation-title" style="color: ${getVerdictColor(verdictClass)}">
                ${verdict} (${(v.confidence * 100).toFixed(0)}%)
              </div>
              <div style="font-size: 11px; color: #666; margin-top: 4px;">
                "${v.claim.substring(0, 80)}${v.claim.length > 80 ? '...' : ''}"
              </div>
              <div style="font-size: 10px; color: #999; margin-top: 4px;">${date}</div>
            </div>
          `;
        }).join('')}
      </div>
      <button class="verify-button" onclick="document.getElementById('result').style.display='none'" style="margin-top: 12px;">
        Close History
      </button>
    `;
    resultDiv.style.display = 'block';
  } catch (error) {
    showError('Failed to load history');
  }
}

function getVerdictColor(verdictClass) {
  const colors = {
    'true': '#155724',
    'false': '#721c24',
    'partially-true': '#856404',
    'not-enough-evidence': '#383d41'
  };
  return colors[verdictClass] || '#333';
}
