# Contributing to WebDebug Pro

First off, thank you for considering contributing to WebDebug Pro! 

## How to Contribute

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally: `git clone https://github.com/v54087912-collab/webdebug-pro.git`
3. **Load unpacked extension**: Go to `chrome://extensions` in your browser, enable "Developer mode", and click "Load unpacked". Select the cloned directory.
4. **Create a new branch** for your feature or bugfix: `git checkout -b feature/my-awesome-feature`
5. **Make your changes** to the code.
6. **Commit your changes**: `git commit -m "Add some awesome feature"`
7. **Push to the branch**: `git push origin feature/my-awesome-feature`
8. **Submit a Pull Request** to the `main` branch of the original repository.

## Coding Guidelines
- Since this is a lightweight MV3 extension, try to avoid adding heavy external libraries (like React/Vue) unless absolutely necessary. Vanilla JS and CSS are preferred to keep the extension fast and bundle size small.
- Ensure any UI changes support both **Light** and **Dark** themes.
- Test your changes both in the **Popup context** and as a **DevTools panel**.

## Reporting Bugs
If you find a bug, please open an issue and include:
- A clear description of the problem.
- Steps to reproduce.
- A screenshot or HTML Bug Report exported directly from WebDebug Pro!
