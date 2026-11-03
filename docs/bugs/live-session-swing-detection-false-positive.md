# Bug: Live session detects a side movement as a swing

## Summary

During a live session, JAiME incorrectly detects a golf swing when the user only moves to the right.

## Steps to reproduce

1. Start a JAiME live session.
2. Stand in position without performing a golf swing.
3. Move your body to the right.
4. Check the detected activity.

## Actual result

JAiME detects the side movement as a completed golf swing.

## Expected result

JAiME should ignore ordinary repositioning or lateral movement and detect a swing only when the movement matches the required swing pattern and motion thresholds.

## Severity

Major / Core feature accuracy — false swing detections can make live-session feedback and session results unreliable.

## Suggested investigation

- Review the live-session movement classification thresholds.
- Require swing-specific sequencing and direction changes instead of relying on general body movement.
- Add a test case for lateral movement without a swing and confirm that no swing event is emitted.

## Acceptance criteria

### Scenario 1: Ignore lateral movement

**Given** a user is in a JAiME live session and is standing in the setup position  
**When** the user moves to the right without performing a golf swing  
**Then** JAiME must not detect or count a swing.

### Scenario 2: Ignore repositioning movements

**Given** a user is in a JAiME live session  
**When** the user steps, repositions, or makes another ordinary movement without completing a swing sequence  
**Then** JAiME must not emit a swing event or increase the swing count.

### Scenario 3: Detect a genuine swing

**Given** a user is in a JAiME live session  
**When** the user performs a complete golf swing that matches the required swing sequence and motion thresholds  
**Then** JAiME must detect and count exactly one swing.

### Scenario 4: Keep results accurate

**Given** a user makes lateral or repositioning movements during a live session  
**When** the session continues or ends  
**Then** false detections must not appear in the swing counter, session results, feedback, or dashboard.

## Scope note

The current `souqna` workspace does not contain the JAiME live-session swing-detection implementation, so the code fix must be made in the separate app/module that owns this feature.
