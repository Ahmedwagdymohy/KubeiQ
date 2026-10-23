/** Runs before paint (inlined in <head>) so the saved theme never flashes. It also marks that
 * script runs, which is what lets section entrances start hidden (see globals.css). */
export const THEME_SCRIPT = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("kubeiq-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
