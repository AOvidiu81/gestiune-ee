// router.js — navigare tip "stack" (Navigator.push/pop din Flutter), cu
// suport pentru butonul Back al Android (fiecare push adauga o stare in
// istoricul browserului, ca butonul fizic Back sa inchida ecranul curent
// in loc sa iasa din PWA).

const root = document.getElementById('screen-stack');
const stack = [];
let depthAtPageLoad = 0;

function renderScreen(screen) {
  const wrapper = el('div', { class: 'screen' });
  wrapper.appendChild(screen.node);
  return wrapper;
}

function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  return node;
}

/**
 * Deschide un ecran nou peste stiva curenta.
 * @param {(ctx: {pop: (result?: any) => void}) => HTMLElement} builder
 * @returns {Promise<any>} rezultatul trimis la pop (ca Navigator.push in Flutter)
 */
export function pushScreen(builder) {
  return new Promise((resolve) => {
    let resolved = false;
    const doPop = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
      closeTop(entry);
    };
    const node = builder({ pop: doPop });
    const entry = { node, resolve: doPop };
    stack.push(entry);
    const wrapper = renderScreen({ node });
    root.appendChild(wrapper);
    entry.wrapper = wrapper;
    requestAnimationFrame(() => wrapper.classList.add('screen-in'));
    history.pushState({ screenDepth: stack.length }, '');
  });
}

function closeTop(entry) {
  const idx = stack.indexOf(entry);
  if (idx === -1) return;
  stack.splice(idx, 1);
  entry.wrapper.classList.add('screen-out');
  setTimeout(() => entry.wrapper.remove(), 220);
}

window.addEventListener('popstate', () => {
  // Butonul Back a fost apasat: inchidem ecranul de deasupra fara sa mai
  // impingem un nou history state.
  const top = stack[stack.length - 1];
  if (top) top.resolve(undefined);
});

export function replaceRoot(builder) {
  root.innerHTML = '';
  stack.length = 0;
  const node = builder({ pop: () => {} });
  root.appendChild(renderScreen({ node }));
}
