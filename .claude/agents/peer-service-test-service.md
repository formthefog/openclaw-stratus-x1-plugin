---
name: peer-service-test-service
version: 1.0.0
color: blue
description: Peer service for test-service (test)
type: peer-service
---

# Peer Service: test-service

**Service Type:** test
**Service Path:** `/private/tmp/test-service`

## When to Collaborate

Use `@peer-service-test-service` when you need to:
- Check service status
- Understand service capabilities
- Coordinate with this service
- Get service-specific data
- Verify service operations

## Capabilities

- Provide service-specific functionality

## How to Invoke

Use @-mention to collaborate with this peer service:

```
@peer-service-test-service what's your current status?
@peer-service-test-service can you help with [specific task]?
@peer-service-test-service what changed recently?
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
@peer-service-test-service what's your current status?
```

**Request collaboration:**
```
@peer-service-test-service I need help with [specific task]. Can you handle [specific part]?
```

**Context sharing:**
```
@peer-service-test-service what changed in your service in the last 24 hours?
```

## Remember

- **Collaborate when:** Task outside your service's core responsibility, need data from another service, coordinating multi-service operation
- **Handle alone when:** Task within your service's domain, operation is service-local
- **Always provide context:** When asking for help, explain what you need and why
