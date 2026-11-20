// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { templateFrames } from '@shared/embedded';

/**
 * The template an element was rendered from, read from the comments Rails
 * writes in development. The markup mirrors a real Rails 8 page: the
 * layout's BEGIN comes before the doctype, with `-->` on the next line.
 * see docs/plans/embedded-rails-plan.md
 */

const PAGE = `<!-- BEGIN app/views/layouts/application.html.erb
--><!DOCTYPE html>
<html><head><title>x</title></head><body>
<nav class="shell">Nav</nav>
<!-- BEGIN app/views/patients/index.html.erb
--><main class="page">
  <ul class="cards">
    <!-- BEGIN app/views/patients/_card.html.erb
    --><li class="card"><h2 class="card__name">Ada</h2></li><!-- END app/views/patients/_card.html.erb -->
    <!-- BEGIN app/views/patients/_card.html.erb
    --><li class="card"><h2 class="card__name">Grace</h2></li><!-- END app/views/patients/_card.html.erb -->
  </ul>
  <!-- BEGIN /home/me/app/app/components/confirm_dialog_component.html.erb --><dialog class="confirm"><p>Sure?</p></dialog><!-- END /home/me/app/app/components/confirm_dialog_component.html.erb -->
  <!-- END app/views/somewhere/_never_opened.html.erb -->
  <footer class="foot">Footer</footer>
</main><!-- END app/views/patients/index.html.erb -->
</body></html>
<!-- END app/views/layouts/application.html.erb -->`;

const parse = (): Document => new DOMParser().parseFromString(PAGE, 'text/html');

describe('templateFrames', () => {
  it('gives each element its innermost template, with a name and kind', () => {
    const doc = parse();
    const frames = templateFrames(doc);
    const at = (selector: string): { name: string; kind: string } | undefined => {
      const el = doc.querySelector(selector);
      const f = el === null ? undefined : frames.get(el);
      return f === undefined ? undefined : { name: f.name, kind: f.kind };
    };
    expect(at('nav.shell')).toEqual({ name: 'layouts/application', kind: 'layout' });
    expect(at('main.page')).toEqual({ name: 'patients/index', kind: 'view' });
    expect(at('h2.card__name')).toEqual({ name: '_card', kind: 'partial' });
    expect(at('dialog.confirm p')).toEqual({ name: 'ConfirmDialogComponent', kind: 'component' });
    // A stray END doesn't close the view around it.
    expect(at('footer.foot')).toEqual({ name: 'patients/index', kind: 'view' });
  });

  it('keeps each rendering of a partial apart, with the template that rendered it as parent', () => {
    const doc = parse();
    const frames = templateFrames(doc);
    const [ada, grace] = Array.from(doc.querySelectorAll('li.card')).map((el) => frames.get(el));
    expect(ada).toBeDefined();
    expect(ada).not.toBe(grace);
    expect(ada?.path).toBe('app/views/patients/_card.html.erb');
    expect(ada?.parent?.path).toBe('app/views/patients/index.html.erb');
    expect(ada?.parent).toBe(grace?.parent);
  });

  it('maps nothing on a page without template comments', () => {
    const doc = new DOMParser().parseFromString('<!-- a note --><main><p>Hi</p></main>', 'text/html');
    expect(templateFrames(doc).size).toBe(0);
  });
});
