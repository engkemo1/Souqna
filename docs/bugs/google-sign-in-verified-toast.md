# Bug: Show no verification toast after Google sign-in

## Summary

After a user signs in with Google, the app displays an **“Email is already verified.”** toast even though the user did not perform an email-verification action.

## Steps to reproduce

1. Open the app's sign-in screen.
2. Choose **Sign in with Google**.
3. Complete the Google sign-in flow.
4. Observe the first screen shown after login.

## Actual result

  An **“Email is already verified.”** toast appears immediately after successful login.

## Expected result

Google sign-in should complete without showing a verification toast. The user should only see a verification message after explicitly requesting email verification or completing a verification-related action.

## Severity

Minor / UX — misleading success feedback after an otherwise successful login.

## Evidence

Screenshot supplied with the report: the toast is visible at the bottom of the home screen after login.

## Scope note

The current `souqna` workspace does not contain a Google sign-in flow or the reported toast text, so the implementation fix must be made in the separate app/module that owns the screenshot.
