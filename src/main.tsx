import { render } from 'preact';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app';
import { init } from './state/store';

render(<App />, document.getElementById('app')!);

void init();
