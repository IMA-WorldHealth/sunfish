function addLoadingToNode(node) {
  node.className += ' loading';
}

const forms = document.querySelectorAll('form');
const elements = document.querySelectorAll('[data-add-loading]');

forms.forEach((form) => {
  form.addEventListener('submit', () => {
    elements.forEach(addLoadingToNode);
  });
});
