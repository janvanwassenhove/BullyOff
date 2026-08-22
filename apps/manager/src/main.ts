import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n } from './i18n';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';

document.documentElement.lang = i18n.global.locale.value;
createApp(App).use(createPinia()).use(i18n).mount('#app');
