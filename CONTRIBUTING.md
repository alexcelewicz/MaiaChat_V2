# Contributing to MaiaChat

Thank you for your interest in contributing to MaiaChat! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature or fix
4. Make your changes
5. Submit a pull request

## Development Setup

```bash
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd MaiaChat_V2/maiachat-v2
cp .env.example .env.local
# Fill in your API keys in .env.local
npm install
docker-compose up -d  # Start PostgreSQL, Redis, MinIO
npm run db:push       # Apply database schema
npm run dev           # Start development server
```

## Code Style

- TypeScript is required for all source files
- Run `npm run lint` before submitting PRs
- Follow existing patterns in the codebase
- Use meaningful variable and function names

## Pull Request Process

1. Ensure your code passes linting (`npm run lint`)
2. Update documentation if you change any public APIs
3. Add a clear description of what your PR does and why
4. Reference any related issues

## Reporting Issues

- Use GitHub Issues to report bugs
- Include steps to reproduce the issue
- Include your environment details (OS, Node version, etc.)
- Include relevant logs or error messages

## Feature Requests

- Open a GitHub Issue with the "feature request" label
- Describe the use case and expected behavior
- Discuss the feature before implementing it

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
