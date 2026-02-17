(() => {
  const toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const sha256 = async (text) => {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(new Uint8Array(digest));
  };

  const decode = (value) => {
    const binary = window.atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const initEncryptedPost = () => {
    document.querySelectorAll(".post-encrypt-container").forEach((container) => {
      const input = container.querySelector(".post-encrypt-input");
      const button = container.querySelector(".post-encrypt-button");
      const error = container.querySelector(".post-encrypt-error");
      const content = container.parentElement.querySelector(".post-encrypt-content");

      if (!input || !button || !error || !content) return;

      button.addEventListener("click", async () => {
        const value = input.value;
        if (!value) return;
        const hash = await sha256(value);
        if (hash !== container.dataset.passwordHash) {
          error.style.display = "block";
          return;
        }
        error.style.display = "none";
        content.innerHTML = decode(container.dataset.content || "");
        content.style.display = "block";
        container.style.display = "none";
      });
    });
  };

  document.addEventListener("DOMContentLoaded", initEncryptedPost);
  document.addEventListener("swup:contentReplaced", initEncryptedPost);
})();
