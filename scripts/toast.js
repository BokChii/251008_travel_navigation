let container;

export function initToasts(root = document.body) {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    root.append(container);
  }
}

export function showToast({ message, timeout = 5000, type = "info" }) {
  initToasts();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });

  const hide = () => {
    toast.classList.remove("toast--visible");
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  };

  if (timeout > 0) {
    setTimeout(hide, timeout);
  }

  toast.addEventListener("click", hide);
}
