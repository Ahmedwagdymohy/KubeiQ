/** Runs before paint (inlined in <head>) so the saved theme never flashes. It also marks that script
 * runs (`.js`), so entrance animations only hide content when they can reveal it again. */
export const THEME_SCRIPT = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("kubeiq-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
