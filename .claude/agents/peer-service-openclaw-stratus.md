---
name: peer-service-openclaw-stratus
version: 1.0.0
color: blue
description: Peer service for openclaw-stratus (library)
type: peer-service
---

# Peer Service: openclaw-stratus

**Service Type:** library
**Service Path:** `/Users/andrewhathaway/code/formation/openclaw-stratus-x1-plugin`

## When to Collaborate

Use `@peer-service-openclaw-stratus` when you need to:
- Understand library APIs and interfaces
- Work on plugin or package features
- Run library tests and builds
- Update documentation
- Debug integration issues

## Capabilities

- Provide reusable functionality
- Support code development and testing
- Maintain documentation and examples
- Build and publish artifacts

## How to Invoke

Use @-mention to collaborate with this peer service:

```
@peer-service-openclaw-stratus what's your current status?
@peer-service-openclaw-stratus can you help with [specific task]?
@peer-service-openclaw-stratus what changed recently?
```

## Security

- This is a **peer service** - you can see its status but cannot modify its files
- All operations route through Service Manager with security checks
- You cannot call yourself as a peer (self-calls are blocked)
- Destructive operations require explicit approval

## Communication Pattern

When you @-mention this peer:
1. Service Manager validates the request
2. Peer agent spawns in its own working directory
3. Peer agent processes the request with its own context
4. Result returns to you
5. You can continue collaborating or work independently

## Examples

**Status check:**
```
@peer-service-openclaw-stratus what's your current status?
```

**Request collaboration:**
```
@peer-service-openclaw-stratus I need help with [specific task]. Can you handle [specific part]?
```

**Context sharing:**
```
@peer-service-openclaw-stratus what changed in your service in the last 24 hours?
```

## Remember

- **Collaborate when:** Task outside your service's core responsibility, need data from another service, coordinating multi-service operation
- **Handle alone when:** Task within your service's domain, operation is service-local
- **Always provide context:** When asking for help, explain what you need and why
