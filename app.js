// 全站唯一的客户端脚本：把带 data-confirm 的表单接上确认视窗。
// 为什么不用 onsubmit="..."：app.js 里 helmet 的 CSP 设了 script-src-attr 'none'，
// 行内事件会被浏览器直接拒绝，所以改成外部脚本 + addEventListener。
document.addEventListener("submit", (event) => {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const message = form.dataset.confirm;

  if (!message) {
    return;
  }

  if (!window.confirm(message)) {
    event.preventDefault();
  }
});
