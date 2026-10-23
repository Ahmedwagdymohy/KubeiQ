/** Runs before paint (inlined in <head>) so the saved theme never flashes. Also marks that script runs. */
export const THEME_SCRIPT = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("kubeiq-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
