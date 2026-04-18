function switchTheme() {
  const currentStyle = currentTheme()
  if (currentStyle === 'light') {
    setTheme('dark')
    setIconTheme('dark')
  }
  else {
    setTheme('light')
    setIconTheme('light')
  }
}

function switchWideMode() {
  const isWide = document.documentElement.getAttribute('data-wide-mode') === 'true';
  setWideMode(!isWide);
}

function setWideMode(isWide) {
  document.documentElement.setAttribute('data-wide-mode', isWide);
  localStorage.setItem('data-wide-mode', isWide);
}

function setTheme(style) {
  document.querySelectorAll('.isInitialToggle').forEach(elem => {
    elem.classList.remove('isInitialToggle');
  });
  document.documentElement.setAttribute('data-color-mode', style);
  localStorage.setItem('data-color-mode', style);
}

function setIconTheme(theme) {
  const twitterIconElement = document.getElementById('twitter-icon')
  const githubIconElement = document.getElementById('github-icon')
  if (twitterIconElement) {
    if (theme === 'light') {
      twitterIconElement.setAttribute("fill", "black")
    } else if (theme === 'dark') {
      twitterIconElement.setAttribute("fill", "white")
    }
  }

  if (githubIconElement) {
    if (theme === 'light') {
      githubIconElement.removeAttribute('color')
      githubIconElement.removeAttribute('class')
    } else if (theme === 'dark') {
      githubIconElement.setAttribute('class', 'octicon')
      githubIconElement.setAttribute('color', '#f0f6fc')
    }
  }
}

function currentTheme() {
  const localStyle = localStorage.getItem('data-color-mode');
  const systemStyle = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return localStyle || systemStyle;
}

function currentWideMode() {
  const localWide = localStorage.getItem('data-wide-mode');
  return localWide === 'true';
}

(() => {
  setTheme(currentTheme());
  setWideMode(currentWideMode());
})();
