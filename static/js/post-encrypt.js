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
  const sanitize = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,iframe,object,embed").forEach((el) => el.remove());
    doc.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  };

  const initEncryptedPost = () => {
    document.querySelectorAll(".post-encrypt-container").forEach((container) => {
      const input = container.querySelector(".post-encrypt-input");
      const button = container.querySelector(".post-encrypt-button");
      const error = container.querySelector(".post-encrypt-error");
      const content = container.parentElement.querySelector(".post-encrypt-content");

      if (!input || !button || !error || !content) return;

      const unlock = async () => {
        const value = input.value;
        if (!value) {
          error.textContent = "请输入密码。";
          error.style.display = "block";
          return;
        }
        const hash = await sha256(value);
        if (hash !== container.dataset.passwordHash) {
          error.textContent = "密码错误，请重试。";
          error.style.display = "block";
          return;
        }
        error.style.display = "none";
        content.innerHTML = sanitize(decode(container.dataset.content || ""));
        content.style.display = "block";
        container.style.display = "none";
      };

      button.addEventListener("click", unlock);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          unlock();
        }
      });
    });
  };

  document.addEventListener("DOMContentLoaded", initEncryptedPost);
  document.addEventListener("swup:contentReplaced", initEncryptedPost);
})();
