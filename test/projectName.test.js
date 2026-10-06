import { describe, it, expect } from 'vitest';
import { projectNameFrom, validateProjectName, suggestProjectName } from '../src/shared/projectName';
describe('validateProjectName', () => {
    it('accepts a simple lowercase name', () => {
        expect(validateProjectName('my-project')).toEqual({ ok: true, value: 'my-project' });
    });
    it('accepts numbers and single letters', () => {
        expect(validateProjectName('a')).toEqual({ ok: true, value: 'a' });
        expect(validateProjectName('proj-2026')).toEqual({ ok: true, value: 'proj-2026' });
    });
    it('trims leading and trailing whitespace before validating', () => {
        expect(validateProjectName('  hello  ')).toEqual({ ok: true, value: 'hello' });
    });
    it('rejects empty input', () => {
        expect(validateProjectName('')).toEqual({
            ok: false,
            error: 'Project name is required.',
        });
    });
    it('rejects whitespace-only input', () => {
        expect(validateProjectName('   ')).toEqual({
            ok: false,
            error: 'Project name is required.',
        });
    });
    it('rejects non-string input', () => {
        expect(validateProjectName(undefined)).toEqual({
            ok: false,
            error: 'Project name is required.',
        });
        expect(validateProjectName(null)).toEqual({
            ok: false,
            error: 'Project name is required.',
        });
    });
    it('rejects names longer than 64 characters', () => {
        const long = 'a'.repeat(65);
        const result = validateProjectName(long);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toMatch(/64/);
        }
    });
    it('accepts a 64-character name', () => {
        const exact = 'a'.repeat(64);
        expect(validateProjectName(exact)).toEqual({ ok: true, value: exact });
    });
    it('rejects uppercase letters', () => {
        const result = validateProjectName('MyProject');
        expect(result.ok).toBe(false);
    });
    it('rejects spaces', () => {
        const result = validateProjectName('my project');
        expect(result.ok).toBe(false);
    });
    it('rejects underscores and other punctuation', () => {
        expect(validateProjectName('my_project').ok).toBe(false);
        expect(validateProjectName('my.project').ok).toBe(false);
        expect(validateProjectName('my/project').ok).toBe(false);
    });
    it('rejects names that start with a hyphen', () => {
        expect(validateProjectName('-project').ok).toBe(false);
    });
    it('rejects names that end with a hyphen', () => {
        expect(validateProjectName('project-').ok).toBe(false);
    });
    it('rejects "." and ".."', () => {
        expect(validateProjectName('.').ok).toBe(false);
        expect(validateProjectName('..').ok).toBe(false);
    });
});
describe('suggestProjectName', () => {
    it('lowercases and replaces spaces with hyphens', () => {
        expect(suggestProjectName('My Cool Project')).toBe('my-cool-project');
    });
    it('collapses runs of non-alphanumerics into a single hyphen', () => {
        expect(suggestProjectName('foo!! bar??')).toBe('foo-bar');
    });
    it('strips leading and trailing hyphens', () => {
        expect(suggestProjectName('---hi---')).toBe('hi');
    });
    it('truncates to 64 characters', () => {
        expect(suggestProjectName('x'.repeat(100))).toHaveLength(64);
    });
    it('returns an empty string for empty input', () => {
        expect(suggestProjectName('')).toBe('');
        expect(suggestProjectName('   ')).toBe('');
    });
});
describe('projectNameFrom', () => {
    it('turns a package name into a valid project name', () => {
        expect(projectNameFrom('riq_frontend')).toBe('riq-frontend');
        expect(projectNameFrom('@acme/Web App!')).toBe('web-app');
        expect(validateProjectName(projectNameFrom('@acme/Web App!'))).toEqual({ ok: true, value: 'web-app' });
    });
    it('keeps it within 64 characters without ending on a hyphen', () => {
        const name = projectNameFrom(`${'a'.repeat(63)}-b`);
        expect(name.length).toBeLessThanOrEqual(64);
        expect(name.endsWith('-')).toBe(false);
    });
    it('falls back to a name when nothing usable is left', () => {
        expect(projectNameFrom('___')).toBe('react-app');
        expect(projectNameFrom('')).toBe('react-app');
    });
});
