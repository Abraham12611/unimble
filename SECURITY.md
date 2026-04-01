# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously at Unimble. If you discover a security vulnerability, please follow these steps:

### Do NOT

- Open a public GitHub issue
- Disclose the vulnerability publicly before it's fixed

### Do

1. **Email us directly** at abraham.dahunsi@gmail.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

2. **Allow time for response** - We aim to respond within 48 hours

3. **Work with us** - We'll work with you to understand and fix the issue

## What to Expect

1. **Acknowledgment** - We'll acknowledge receipt within 48 hours
2. **Assessment** - We'll assess the vulnerability and determine severity
3. **Fix** - We'll develop and test a fix
4. **Release** - We'll release the fix and credit you (if desired)
5. **Disclosure** - We'll coordinate public disclosure timing with you

## Security Measures

Unimble implements the following security measures:

- **Authentication**: Clerk for secure user authentication
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: All data encrypted in transit (TLS) and at rest
- **Dependency Scanning**: Automated Snyk scanning for vulnerabilities
- **Code Review**: All changes require PR review before merge
- **Secrets Management**: Environment variables for sensitive data

## Security Best Practices for Contributors

- Never commit secrets, API keys, or credentials
- Use environment variables for sensitive configuration
- Validate and sanitize all user input
- Follow the principle of least privilege
- Keep dependencies up to date

Thank you for helping keep Unimble secure!
