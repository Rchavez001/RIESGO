import React from 'react';
import { render } from '@testing-library/react';

// Mock react-router-dom v7 como módulo virtual para Jest 27 (CRA no soporta exports de package.json)
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: any) => <div>{children}</div>,
  Routes: ({ children }: any) => <div>{children}</div>,
  Route: ({ element }: any) => <div>{element}</div>,
  Navigate: () => <div>Navigate</div>,
  Outlet: () => <div>Outlet</div>,
  useLocation: () => ({ pathname: '/', search: '' }),
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  NavLink: ({ children }: any) => <a>{children}</a>,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}), { virtual: true });

// Mock Three.js / WebGL backdrop para entorno jsdom de pruebas
jest.mock('./components/DojoWebGLBackdrop', () => ({
  DojoWebGLBackdrop: () => <div data-testid="dojo-backdrop-mock" />
}));

import App from './App';

test('renders Ciber Dojo application without crashing', () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const { container } = render(<App />);
  expect(container).toBeDefined();
});
