/** Runs before paint (inlined in <head>) so the saved theme never flashes. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("kubeiq-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
