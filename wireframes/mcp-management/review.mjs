const dialog=document.getElementById('ia-dialog');
document.getElementById('open-ia').addEventListener('click',()=>dialog.showModal());
document.getElementById('close-ia').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',(event)=>{if(event.target.closest('[data-view]'))dialog.close();});
dialog.addEventListener('close',()=>document.getElementById('open-ia').focus());
document.getElementById('toggle-theme').addEventListener('click',(event)=>{
  const dark=document.documentElement.dataset.theme!=='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  event.currentTarget.textContent=dark?'밝게 보기':'어둡게 보기';
});
