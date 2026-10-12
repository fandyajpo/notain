import { defineCustomElement } from 'vue';
import Picker from './Picker.vue';
import Probe from './Probe.vue';

/**
 * Side-effect import: registers the Vue islands. `shadowRoot: false` keeps
 * them in the light DOM so the app's Tailwind stylesheet applies and
 * CustomEvents bubble up to the host element React listens on.
 */
export const NotainProbeVue = defineCustomElement(Probe, { shadowRoot: false });
export const NotainPicker = defineCustomElement(Picker, { shadowRoot: false });

if (typeof window !== 'undefined') {
  if (!customElements.get('notain-probe-vue')) {
    customElements.define('notain-probe-vue', NotainProbeVue);
  }
  if (!customElements.get('notain-picker')) {
    customElements.define('notain-picker', NotainPicker);
  }
}
