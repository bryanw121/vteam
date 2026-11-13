// Pre-configure RNTL host component names to avoid auto-detection which breaks with React 19
// RNTL v11's detectHostComponentNames() uses react-test-renderer.create() outside of act(),
// which fails with React 19's stricter concurrency requirements.
const { configureInternal } = require('@testing-library/react-native/build/config')
configureInternal({
  hostComponentNames: { text: 'Text', textInput: 'TextInput' },
})

// `lib/supabase` calls createClient() at module scope, which throws without a
// URL. Unit tests never hit the network — they either exercise pure helpers or
// mock the client — so stand in placeholders when a real .env isn't loaded.
// Only fills gaps: CI supplies the real values as Actions secrets.
process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'

// AsyncStorage is a native module with no JS implementation under Jest. Any test
// that reaches `lib/supabase` (which constructs the client with an AsyncStorage
// auth store) pulls it in transitively, so use the library's official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// Reanimated 4.7's own mock initialises native modules and throws under Jest: use a small JS
// stand-in for Reanimated (__tests__/helpers/reanimatedMock.js) and worklets' own JS mock.
// A string path, so tsc doesn't type-check the package's .ts mock source.
const WORKLETS_MOCK = 'react-native-worklets/src/mock'
jest.mock('react-native-worklets', () => require(WORKLETS_MOCK))
jest.mock('react-native-reanimated', () => require('./__tests__/helpers/reanimatedMock'))
