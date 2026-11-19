# Octo cheat sheet (CHIP-8 only)

Written for this project in our own words, from the Octo language documentation (John Earnest, github.com/JohnEarnest/Octo, MIT, the same license as the vendored compiler). No text is copied. Every snippet below is checked by `tests/compiler/cheatsheet.test.ts`.

Target: plain CHIP-8. The compiler wrapper rejects SUPER-CHIP and XO-CHIP words (`hires`, `scroll-*`, `plane`, `audio`, `saveflags`, and similar). Screen 64x32, ROM at most 3584 bytes, 16 keys, registers `v0` to `vf`, index register `i`.

## Program shape
```
# comments start with #
: main            # execution starts at the first instruction, so put "main" first
  v0 := 10
  loop
    v0 += 1
  again           # again = jump back to loop
```
- The program starts at the top of the file. Put `: main` first, or jump to it with `main`. Data labels placed before `: main` would be executed as code.
- `: name` defines a label. Writing a label name as a statement calls it (`name`). `return` ends a subroutine.
- Numbers: decimal `10`, hex `0xFF`, binary `0b1010`. Negative numbers and `#` comments work as expected.

## Registers and assignment
```
v0 := 5          # load constant
v0 := v1         # copy
v0 += 1          # add (vf set to 1 on carry for register operands)
v0 += v1
v0 -= v1         # vf = 1 when no borrow
v0 =- v1         # v0 = v1 - v0
v0 |= v1  v0 &= v1  v0 ^= v1
v0 >>= v1        # shift right, vf = shifted-out bit
v0 <<= v1
v0 := random 0xFF   # random byte ANDed with the mask
:alias px v3     # name a register
:const SPEED 2   # named constant
```
`vf` is overwritten by arithmetic, shifts, and `sprite`. Do not keep a value in `vf`.

## Index register and memory
```
i := some-label  # point i at data
i := hex v0      # i = built-in font glyph for the digit in v0 (low nibble), 5 bytes tall
i += v0
save v2          # store v0..v2 at i (increments i)
load v2          # read v0..v2 from i
bcd v0           # store 3 decimal digits of v0 at i, i+1, i+2
```
Sprite data is bytes after a label, one byte per row, MSB on the left:
```
: ball
  0b01100000
  0b11110000
  0b11110000
  0b01100000
```
Data must not be reached by the program counter. Put it after a `again` loop or after `return`, or jump over it.

## Drawing
```
clear                    # blank the screen
i := ball
sprite v0 v1 4           # draw 4 rows at (v0, v1), XOR. vf = 1 if a lit pixel was erased
sprite v0 v1 4           # drawing again erases it
```
Sprites are 1 to 15 rows tall (8 pixels wide). Coordinates wrap around the screen edges. Collision test: draw, then `if vf == 1 then ...`.

## Conditions
```
if v0 == 5 then v1 := 1       # single statement
if v0 != v1 then v2 += 1
if v0 > 3 then ...            # also <, >=, <= (compiled to a few instructions)
if v0 == 0 begin              # block form
  ...
else
  ...
end
```
Single-statement `then` works with `:=`, `+=`, calls, `return`, `jump`. Use `begin ... end` for anything longer.

## Loops
```
loop
  ...
  if v0 == 9 then return   # leave by return/jump
again

loop
  v0 += 1
  while v0 != 10           # exits the loop when the condition is false
again
```
`while` only works inside `loop ... again`. `again` always jumps back.

## Keys
CHIP-8 keys are hex 0 to F. On the keyboard: `1 2 3 4 / Q W E R / A S D F / Z X C V` map to `1 2 3 C / 4 5 6 D / 7 8 9 E / A 0 B F`.
```
v0 := 4
if v0 key then v1 += 1        # key currently held
if v0 -key then v1 -= 1       # key not held
v0 := key                     # wait for a key press and release, store it
```
Common layout: left = 4 (Q), right = 6 (E), up = 5 (W), down = 8 (S), fire = 7 (A) or 5.

## Timers and sound
```
v0 := 60
delay := v0       # delay timer counts down 60 times per second
v0 := delay       # read it
buzzer := v0      # sound timer, beeps while above 0
```
Frame pacing idiom (about 60 passes per second, works because the emulator ticks timers once per frame):
```
: wait-tick
  v0 := 1
  delay := v0
  loop
    v0 := delay
    while v0 != 0
  again
  return
```
## Calls and jumps
```
my-routine        # call
jump my-label     # goto
jump0 my-label    # goto my-label + v0
return
```
The call stack is at most 12 deep in Octo (our emulator allows 16). Keep nesting shallow.

## Design rules for generated games
- Put `: main` first. Keep one clear goal, a visible score or lives (use `i := hex vN` then `sprite`), a game-over state, and a restart key.
- Pace the loop with the delay timer, otherwise the game runs far too fast.
- Draw a sprite, update its position, draw it again to erase the old image (XOR).
- Stay within 64x32 pixels and 3584 bytes. Never end the program by falling off the last instruction. End with `loop` / `again`.
- Complete example programs live in `examples/*.8o`.
