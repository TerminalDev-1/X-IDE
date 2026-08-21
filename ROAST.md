# The X-IDE Roast

We removed GitHub Copilot.

Not the excellent editor UI around it. Not the chat panel. Not the tool surfaces. We removed the part where an open-source editor suddenly behaves like a nightclub bouncer because you asked it to complete a function.

Microsoft built one of the finest code editors on Earth, then placed an authentication turnstile between the keyboard and the useful AI bits. Click autocomplete while signed out? “Sign in to use AI features.” Open the model picker? Here comes a full-screen account ceremony. Apparently predicting the next line of TypeScript requires the digital equivalent of passport control. 💀

## Eight steps to escape one login button

Getting first-class Codex support took eight major integration steps:

1. Bundle the Codex SDK and native executable.
2. Build Codex-native login and session management.
3. Publish Luna through VS Code's model machinery.
4. Redirect every utility-model back road away from GitHub CAPI.
5. Remove the Copilot entitlement and sign-in gates.
6. Translate Codex streaming events into the agent UI.
7. Make filesystem changes appear live instead of waiting for Windows to sneeze.
8. Replace quota-bound completion fetching with a fast local repository engine.

Eight steps. To make an editor accept that perhaps the person sitting at the computer should be allowed to use the computer.

## The model buffet with one laminated pea

Copilot's model picker had the energy of a restaurant handing you a twelve-page menu, asking you to create an account, checking your subscription tier, and then revealing that tonight's special is one allegedly blessed model with a usage meter attached.

X-IDE publishes GPT-5.6 Luna through Codex and stops pretending that a vendor ID is a sacred bloodline. The old `copilot` identifier survives internally because VS Code has welded it into half the building; it is now plumbing, not a landlord.

## Autocomplete without a tiny accountant

The local completion path reads the repository, learns identifiers and repeated code patterns, and answers without sending a request to Copilot. An optional small Ollama model can improve quality, but the instant deterministic path never depends on a cloud round trip.

No Copilot request counter. No “premium request” anxiety. No popup suggesting that typing the rest of your own function is an exciting upgrade opportunity. Hosted Codex can still have account-level limits because servers are made of matter, but local autocomplete is gloriously free of the tiny accountant living in the status bar.

## Settings that admit humans exist

The old settings experience is still there for people who enjoy searching thousands of configuration keys like an archaeologist deciphering a cursed JSON tablet. X-IDE adds a centred page for themes, icons, autocomplete and Auto Save because changing the colour scheme should not require a minor in command-palette studies.

And when no folder is open, the middle of the editor now contains **Open Folder** and **Open File**. Revolutionary technology, apparently: putting the two things a new user needs where the new user is already looking.

## Credit where it is due

VS Code is a phenomenal open-source engineering achievement. That is precisely why the product decisions around account gates, quota surfaces and Copilot-shaped coupling are so roastable: the foundation is brilliant enough that the nonsense stands out in 4K.

Thanks for the editor, Microsoft. We have moved the tollbooth.
