/* Share bar on static story pages: copy link + native share. WhatsApp and X are plain links. */
(function () {
  var bar = document.querySelector('.share'); if (!bar) return;
  var url = bar.getAttribute('data-url') || location.href, title = bar.getAttribute('data-title') || document.title;
  var status = bar.querySelector('.share-status');
  function say(t) { if (status) { status.textContent = t; setTimeout(function () { status.textContent = ''; }, 2400); } }
  var copy = bar.querySelector('.share-copy');
  if (copy) copy.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { say('Link copied'); }, function () { say(url); });
    else { window.prompt('Copy this link', url); }
  });
  var nat = bar.querySelector('.share-native');
  if (nat && navigator.share) {
    nat.hidden = false;
    nat.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); });
  }
}());
