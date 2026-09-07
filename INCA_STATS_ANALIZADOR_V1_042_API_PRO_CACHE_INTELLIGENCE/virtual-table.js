(() => {
  'use strict';
  const mounts = new WeakMap();

  function destroy(tbody) {
    const state = mounts.get(tbody);
    if (!state) return;
    state.container.removeEventListener('scroll', state.onScroll);
    window.removeEventListener('resize', state.onScroll);
    mounts.delete(tbody);
  }

  function mount({ container, tbody, items, rowHeight=72, overscan=6, renderRow }) {
    destroy(tbody);
    if (!container || !tbody || !Array.isArray(items) || typeof renderRow !== 'function') return;

    if (items.length <= 45) {
      const frag = document.createDocumentFragment();
      items.forEach((item,index) => frag.appendChild(renderRow(item,index)));
      tbody.replaceChildren(frag);
      return;
    }

    const top = document.createElement('tr');
    const bottom = document.createElement('tr');
    const topCell = document.createElement('td');
    const bottomCell = document.createElement('td');
    topCell.colSpan = bottomCell.colSpan = 99;
    topCell.style.padding = bottomCell.style.padding = '0';
    topCell.style.border = bottomCell.style.border = '0';
    top.append(topCell); bottom.append(bottomCell);

    let raf = 0;
    const render = () => {
      raf = 0;
      const viewport = container.clientHeight || 720;
      const start = Math.max(0, Math.floor(container.scrollTop / rowHeight) - overscan);
      const count = Math.ceil(viewport / rowHeight) + overscan * 2;
      const end = Math.min(items.length, start + count);
      topCell.style.height = `${start * rowHeight}px`;
      bottomCell.style.height = `${Math.max(0,(items.length-end)*rowHeight)}px`;
      const frag = document.createDocumentFragment();
      frag.append(top);
      for (let i=start;i<end;i++) frag.append(renderRow(items[i],i));
      frag.append(bottom);
      tbody.replaceChildren(frag);
    };
    const onScroll = () => { if (!raf) raf=requestAnimationFrame(render); };
    container.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll,{passive:true});
    mounts.set(tbody,{container,onScroll});
    render();
  }

  window.INCA_VIRTUAL_TABLE = { mount, destroy };
})();
