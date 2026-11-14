import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App, canOrderForServiceDay, serviceDayDeadline } from './app';

describe('App', () => {
  beforeEach(async () => {
    vi.spyOn(App.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
    expect(compiled.querySelector('h1')?.textContent).toContain('What I’m eating today');
  });

  it('should not select a service day by default', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.weeklyMenu = [
      { service_date: '2026-11-17', label: 'Tuesday, 17 November', day: null, items: [] },
    ];
    fixture.detectChanges();

    expect(app.customerDate).toBe('');
    expect(app.availabilityText).toBe('No day selected');
    expect(fixture.nativeElement.querySelector('.weekly-menu-card.selected')).toBeNull();
    expect(fixture.nativeElement.querySelector('#menu-title')?.textContent).toContain(
      'Choose a service day',
    );
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
    app.customerDate = '2026-11-17';
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

  it('should close ordering at exactly 9:00 PM IST on the previous day', () => {
    const deadline = serviceDayDeadline('2026-11-17');

    expect(deadline.toISOString()).toBe('2026-11-16T15:30:00.000Z');
    expect(canOrderForServiceDay('2026-11-17', new Date('2026-11-16T15:29:59.999Z'))).toBe(true);
    expect(canOrderForServiceDay('2026-11-17', deadline)).toBe(false);
    expect(canOrderForServiceDay('2026-11-17', new Date('2026-11-16T15:30:00.001Z'))).toBe(false);
  });

  it('should show all service dates for the current or next menu week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T06:30:00.000Z'));
    const mondayFixture = TestBed.createComponent(App);
    expect(mondayFixture.componentInstance.weekServiceDates.map((day) => day.value)).toEqual([
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);

    vi.setSystemTime(new Date('2026-11-20T06:30:00.000Z'));
    const fridayFixture = TestBed.createComponent(App);
    expect(fridayFixture.componentInstance.weekServiceDates.map((day) => day.value)).toEqual([
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
    ]);
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

  it('should copy the payment phone number and confirm the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      userAgent: navigator.userAgent,
      clipboard: { writeText },
    });
    const app = TestBed.createComponent(App).componentInstance;

    await app.copyPaymentPhone();

    expect(writeText).toHaveBeenCalledWith('9207285657');
    expect(app.copyPaymentPhoneMessage).toBe('Payment number copied.');
  });
});
