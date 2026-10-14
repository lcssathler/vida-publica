import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

// Armazenamento local em memória nos testes.
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
