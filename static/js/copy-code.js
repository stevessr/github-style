
document.addEventListener('DOMContentLoaded', (event) => {
  document.querySelectorAll('pre code').forEach((block) => {
    var button = document.createElement('button');
    button.className = 'copy-code-button';
    button.type = 'button';
    button.innerText = 'Copy';

    var pre = block.parentNode;
    if (pre.parentNode.classList.contains('highlight')) {
      var highlight = pre.parentNode;
      highlight.insertBefore(button, highlight.firstChild);
    } else {
      pre.parentNode.insertBefore(button, pre);
    }

    button.addEventListener('click', () => {
      var code = block.innerText;
      navigator.clipboard.writeText(code).then(() => {
        button.innerText = 'Copied!';
        setTimeout(() => {
          button.innerText = 'Copy';
        }, 2000);
      }, (err) => {
        console.error('Could not copy text: ', err);
      });
    });
  });
});
