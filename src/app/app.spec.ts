import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    vi.spyOn(App.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the Plates home page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Comfort food');
  });

  it('should update the order total when a plate is selected', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app.customerDay = {
      service_date: '2026-11-17',
      capacity: 5,
      booked_meals: 0,
      ordering_open: true,
    };
    app.menuItems = [
      {
        id: 'biriyani',
        service_date: '2026-11-17',
        name: 'Chicken Biriyani',
        description: 'Sample menu item',
        price: 140,
        enabled: true,
      },
    ];
    expect(app.menuItems).toHaveLength(1);
    expect(app.orderingAvailable).toBe(true);
    fixture.detectChanges();
    app.adjustQuantity('biriyani', 1);
    expect(app.totalSelected).toBe(1);
    fixture.detectChanges();

    expect(app.orderTotal).toBe(140);
  });

  it('should provide a description field when adding a dish', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.adminView = true;
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.new-menu-item') as HTMLFormElement;
    expect(form.querySelector('input[name="name"]')).not.toBeNull();
    expect(form.querySelector('textarea[name="description"]')).not.toBeNull();
    expect(form.querySelector('input[name="price"]')).not.toBeNull();
  });
});
