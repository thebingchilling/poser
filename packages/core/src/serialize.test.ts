import { describe, expect, it } from 'vitest';
import { createProject } from './factory';
import { PROJECT_FORMAT_VERSION, ProjectFormatError, deserializeProject, serializeProject } from './serialize';

describe('serialization', () => {
  it('round-trips a project', () => {
    const project = createProject('Round trip');
    expect(deserializeProject(serializeProject(project))).toEqual(project);
  });

  it('rejects garbage and foreign files', () => {
    expect(() => deserializeProject('nope')).toThrow(ProjectFormatError);
    expect(() => deserializeProject('{"format":"other"}')).toThrow(ProjectFormatError);
    expect(() => deserializeProject('{"format":"poser-project","version":1,"project":{}}')).toThrow(ProjectFormatError);
  });

  it('rejects files from a newer version', () => {
    const json = JSON.stringify({ format: 'poser-project', version: PROJECT_FORMAT_VERSION + 1, project: createProject() });
    expect(() => deserializeProject(json)).toThrow(/newer version/);
  });
});
