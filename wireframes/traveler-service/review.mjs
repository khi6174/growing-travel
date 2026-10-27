const notes=document.getElementById('design-notes');
const opener=document.getElementById('open-notes');
opener.addEventListener('click',()=>notes.showModal());
document.getElementById('close-notes').addEventListener('click',()=>notes.close());
notes.addEventListener('close',()=>opener.focus());
