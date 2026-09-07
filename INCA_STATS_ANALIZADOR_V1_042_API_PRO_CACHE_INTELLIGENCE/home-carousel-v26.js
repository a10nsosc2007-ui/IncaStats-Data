(()=>{
  'use strict';
  const viewport=document.getElementById('home25Carousel');
  const track=document.getElementById('home25CarouselTrack');
  const prev=document.getElementById('home25CarouselPrev');
  const next=document.getElementById('home25CarouselNext');
  const count=document.getElementById('home25CarouselCount');
  const dots=document.getElementById('home25CarouselDots');
  if(!viewport||!track)return;

  const cards=[...track.querySelectorAll('.home25-card')];
  if(!cards.length)return;
  let active=0, timer=null, raf=0;

  const pad=n=>String(n).padStart(2,'0');
  if(dots){
    dots.innerHTML=cards.map((_,i)=>`<i data-dot="${i}" class="${i===0?'active':''}"></i>`).join('');
  }

  function gap(){
    const styles=getComputedStyle(track);
    return parseFloat(styles.columnGap||styles.gap||12)||12;
  }
  function step(){return cards[0].getBoundingClientRect().width+gap();}
  function maxIndex(){return Math.max(0,cards.length-1);}
  function update(index){
    active=Math.max(0,Math.min(maxIndex(),index));
    if(count)count.textContent=`${pad(active+1)} / ${pad(cards.length)}`;
    dots?.querySelectorAll('i').forEach((d,i)=>d.classList.toggle('active',i===active));
  }
  function nearestIndex(){
    const x=viewport.scrollLeft;
    let best=0,dist=Infinity;
    cards.forEach((card,i)=>{
      const d=Math.abs(card.offsetLeft-x-track.offsetLeft);
      if(d<dist){dist=d;best=i;}
    });
    return best;
  }
  function go(index,behavior='smooth'){
    const i=Math.max(0,Math.min(maxIndex(),index));
    const left=cards[i].offsetLeft-track.offsetLeft;
    viewport.scrollTo({left,behavior});
    update(i);
    restart();
  }
  function forward(){
    const visible=Math.max(1,Math.floor((viewport.clientWidth+gap())/step()));
    if(active>=cards.length-visible)go(0); else go(active+1);
  }
  function backward(){go(active<=0?maxIndex():active-1);}
  function restart(){
    if(timer)clearInterval(timer);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    timer=setInterval(forward,7000);
  }

  prev?.addEventListener('click',backward);
  next?.addEventListener('click',forward);
  viewport.addEventListener('scroll',()=>{
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>update(nearestIndex()));
  },{passive:true});
  viewport.addEventListener('mouseenter',()=>{if(timer)clearInterval(timer)});
  viewport.addEventListener('mouseleave',restart);
  viewport.addEventListener('focusin',()=>{if(timer)clearInterval(timer)});
  viewport.addEventListener('focusout',restart);
  viewport.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){e.preventDefault();forward();}
    if(e.key==='ArrowLeft'){e.preventDefault();backward();}
  });
  cards.forEach(card=>card.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}
  }));
  window.addEventListener('resize',()=>go(active,'auto'),{passive:true});
  update(0);restart();
  console.info('[INCA HOME V26] Carrusel editorial listo',{cards:cards.length});
})();
