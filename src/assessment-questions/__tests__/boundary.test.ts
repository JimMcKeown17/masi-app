import { findForbiddenImports } from '../boundary/findForbiddenImports';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('findForbiddenImports (scanner)', () => {
  test('catches a Supabase client import', () => {
    const code = `import { createClient } from '@supabase/supabase-js';`;
    expect(findForbiddenImports(code)).toEqual(['@supabase/supabase-js']);
  });

  test('catches an AsyncStorage import', () => {
    const code = `import AsyncStorage from '@react-native-async-storage/async-storage';`;
    expect(findForbiddenImports(code)).toEqual([
      '@react-native-async-storage/async-storage',
    ]);
  });

  test('catches a relative import into src/services', () => {
    const code = `import { syncOutbox } from '../../services/sync/outbox';`;
    expect(findForbiddenImports(code)).toEqual(['../../services/sync/outbox']);
  });

  test('catches a relative import into src/repositories', () => {
    const code = `import { childRepo } from '../../repositories/childRepo';`;
    expect(findForbiddenImports(code)).toEqual([
      '../../repositories/childRepo',
    ]);
  });

  test('catches a relative import into src/screens', () => {
    const code = `import { HomeScreen } from '../../screens/HomeScreen';`;
    expect(findForbiddenImports(code)).toEqual(['../../screens/HomeScreen']);
  });

  test('allows React, React Native, and intra-package imports', () => {
    const code = `
      import React, { useState } from 'react';
      import { View, Text } from 'react-native';
      import { useToggleMark } from '../hooks/useToggleMark';
      import type { Result } from '../types/Result';
    `;
    expect(findForbiddenImports(code)).toEqual([]);
  });

  test('catches a side-effect import (no from clause)', () => {
    const code = `import '@supabase/supabase-js';`;
    expect(findForbiddenImports(code)).toEqual(['@supabase/supabase-js']);
  });

  test('catches a dynamic import()', () => {
    const code = `const sb = await import('@supabase/supabase-js');`;
    expect(findForbiddenImports(code)).toEqual(['@supabase/supabase-js']);
  });

  test('catches a CommonJS require()', () => {
    const code = `const sb = require('@supabase/supabase-js');`;
    expect(findForbiddenImports(code)).toEqual(['@supabase/supabase-js']);
  });

  test('catches expo-sqlite (host storage)', () => {
    const code = `import * as SQLite from 'expo-sqlite';`;
    expect(findForbiddenImports(code)).toEqual(['expo-sqlite']);
  });

  test('catches expo-image-picker (host camera)', () => {
    const code = `import * as ImagePicker from 'expo-image-picker';`;
    expect(findForbiddenImports(code)).toEqual(['expo-image-picker']);
  });

  test('catches expo-file-system (host storage)', () => {
    const code = `import * as FileSystem from 'expo-file-system';`;
    expect(findForbiddenImports(code)).toEqual(['expo-file-system']);
  });

  test('catches @react-native-community/netinfo (host network)', () => {
    const code = `import NetInfo from '@react-native-community/netinfo';`;
    expect(findForbiddenImports(code)).toEqual(['@react-native-community/netinfo']);
  });

  test('catches relative imports into ../../db', () => {
    const code = `import { db } from '../../db/sqlite';`;
    expect(findForbiddenImports(code)).toEqual(['../../db/sqlite']);
  });

  test('catches relative imports into ../../config', () => {
    const code = `import { supabaseUrl } from '../../config/supabaseProjectConfig';`;
    expect(findForbiddenImports(code)).toEqual([
      '../../config/supabaseProjectConfig',
    ]);
  });

  test('catches relative imports into ../../context', () => {
    const code = `import { OfflineContext } from '../../context/OfflineContext';`;
    expect(findForbiddenImports(code)).toEqual(['../../context/OfflineContext']);
  });

  test('allows the plain react-native package (not @react-native-community)', () => {
    const code = `import { View } from 'react-native';`;
    expect(findForbiddenImports(code)).toEqual([]);
  });
});

describe('OSS boundary — live scan', () => {
  test('no file in src/assessment-questions/ has a forbidden import', async () => {
    const root = path.resolve(__dirname, '..');
    const files = await collectTsFiles(root);
    const violations: { file: string; offender: string }[] = [];
    for (const file of files) {
      if (file.includes('__tests__')) continue;
      const content = await fs.readFile(file, 'utf8');
      for (const offender of findForbiddenImports(content)) {
        violations.push({ file: path.relative(process.cwd(), file), offender });
      }
    }
    expect(violations).toEqual([]);
  });
});

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
