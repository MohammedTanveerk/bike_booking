"use strict";

const STORAGE_KEYS = {
  bookings: "bikecarePro.bookings",
  cart: "bikecarePro.cart",
  profile: "bikecarePro.profile",
  payments: "bikecarePro.payments",
  newsletter: "bikecarePro.newsletter"
};

const servicePrices = {
  "General Bike Service": 1499,
  "Engine Oil Change": 699,
  "Brake Inspection": 399,
  "Chain Cleaning and Lubrication": 299,
  "Battery Replacement": 1299,
  "Tyre Replacement": 2499,
  "Engine Repair": 2999,
  "Full Bike Washing": 499,
  "Bike Denting and Painting": 1999,
  "Electrical Repair": 799,
  "Basic Package": 499,
  "Premium Package": 999,
  "Ultimate Package": 1999
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
let activeFilter = "all";
let checkoutContext = null;
let activeBookingId = null;
let authMode = "login";

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from localStorage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key} to localStorage.`, error);
    return false;
  }
}

function formatPrice(amount) {
  return currency.format(Number(amount) || 0);
}

function setMinBookingDate() {
  const dateInput = document.getElementById("bookingDate");
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  dateInput.min = localToday;
}

function closeMobileMenu() {
  const menu = document.getElementById("navLinks");
  const toggle = document.getElementById("menuToggle");
  menu.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation menu");
}

function showNotice(element, message, className) {
  element.textContent = message;
  element.className = className;
}

function filterServices() {
  const query = document.getElementById("serviceSearch").value.trim().toLowerCase();
  const cards = [...document.querySelectorAll(".service-card")];
  let visibleCount = 0;
  cards.forEach((card) => {
    const matchesText = card.dataset.name.toLowerCase().includes(query);
    const matchesCategory = activeFilter === "all" || card.dataset.category === activeFilter;
    const visible = matchesText && matchesCategory;
    card.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  });
  document.getElementById("serviceEmpty").classList.toggle("hidden", visibleCount > 0);
}

function filterProducts() {
  const query = document.getElementById("productSearch").value.trim().toLowerCase();
  const cards = [...document.querySelectorAll(".product-card")];
  let visibleCount = 0;
  cards.forEach((card) => {
    const visible = card.dataset.name.toLowerCase().includes(query);
    card.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  });
  document.getElementById("productEmpty").classList.toggle("hidden", visibleCount > 0);
}

function getCart() {
  const cart = readStorage(STORAGE_KEYS.cart, []);
  return Array.isArray(cart) ? cart : [];
}

function updateCart() {
  const cart = getCart();
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  document.getElementById("cartCount").textContent = count;
  document.getElementById("cartCountShop").textContent = count;
  document.getElementById("cartDrawerCount").textContent = count;
  document.getElementById("cartTotal").textContent = formatPrice(total);

  const items = document.getElementById("cartItems");
  if (!cart.length) {
    items.innerHTML = '<p class="cart-empty">Your cart is waiting for its first road-ready essential.</p>';
  } else {
    items.innerHTML = cart.map((item) => `
      <article class="cart-item">
        <div><h4>${escapeHtml(item.name)}</h4><p>${formatPrice(item.price)} each</p><button class="remove-item" data-cart-action="remove" data-id="${escapeHtml(item.id)}">Remove</button></div>
        <div class="cart-item-actions"><button class="quantity-button" data-cart-action="decrease" data-id="${escapeHtml(item.id)}" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button><span>${item.quantity}</span><button class="quantity-button" data-cart-action="increase" data-id="${escapeHtml(item.id)}" aria-label="Increase ${escapeHtml(item.name)} quantity">+</button></div>
      </article>`).join("");
  }
  if (checkoutContext === "cart") updatePaymentSummary(total, "Your accessories");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function openCart() {
  const panel = document.getElementById("cartPanel");
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  document.getElementById("cartClose").focus();
}

function closeCart() {
  const panel = document.getElementById("cartPanel");
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function addToCart(button) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === button.dataset.id);
  if (existing) existing.quantity += 1;
  else cart.push({ id: button.dataset.id, name: button.dataset.name, price: Number(button.dataset.price), quantity: 1 });
  if (writeStorage(STORAGE_KEYS.cart, cart)) {
    checkoutContext = null;
    activeBookingId = null;
    updateCart();
    updatePaymentSummary(0, "Workshop service", false);
    button.innerHTML = "Added <span>✓</span>";
    window.setTimeout(() => { button.innerHTML = "Add to cart <span>+</span>"; }, 1000);
  }
}

function changeCartItem(id, action) {
  let cart = getCart();
  if (action === "remove") cart = cart.filter((item) => item.id !== id);
  else {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    item.quantity += action === "increase" ? 1 : -1;
    if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== id);
  }
  if (writeStorage(STORAGE_KEYS.cart, cart)) updateCart();
}

function updatePaymentSummary(amount, label, canPay = Boolean(checkoutContext)) {
  const total = Math.max(0, Number(amount) || 0);
  document.getElementById("paymentItem").textContent = label;
  document.getElementById("paymentSubtotal").textContent = formatPrice(total);
  document.getElementById("paymentCharges").textContent = formatPrice(0);
  document.getElementById("paymentTotal").textContent = formatPrice(total);
  document.getElementById("paymentHint").textContent = total > 0 && canPay
    ? "Demo checkout only — no real payment will be processed."
    : total > 0
      ? "Confirm an appointment or continue from your cart to enable demo checkout."
    : "Choose a service or add products to see your total.";
  document.querySelector(".payment-submit").disabled = total === 0 || !canPay;
  document.getElementById("paymentConfirmation").classList.add("hidden");
}

function getBookings() {
  const bookings = readStorage(STORAGE_KEYS.bookings, []);
  return Array.isArray(bookings) ? bookings : [];
}

function makeBookingId() {
  const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `BC-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

function submitBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = document.getElementById("bookingError");
  const confirmation = document.getElementById("bookingConfirmation");
  errorBox.classList.add("hidden");
  confirmation.classList.add("hidden");
  if (!form.reportValidity()) return;

  const values = Object.fromEntries(new FormData(form).entries());
  const phoneDigits = values.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    showNotice(errorBox, "Enter a valid mobile number with 10 to 15 digits.", "form-error");
    return;
  }
  const selectedDate = new Date(`${values.date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDate < today) {
    showNotice(errorBox, "Please choose today or a future appointment date.", "form-error");
    return;
  }

  const bookings = getBookings();
  const price = servicePrices[values.service] || 0;
  const booking = {
    id: makeBookingId(),
    ...values,
    price,
    status: "Confirmed",
    paymentStatus: "Unpaid",
    createdAt: new Date().toISOString()
  };
  bookings.unshift(booking);
  if (!writeStorage(STORAGE_KEYS.bookings, bookings)) {
    showNotice(errorBox, "We couldn’t save this booking in your browser. Please check local storage settings and try again.", "form-error");
    return;
  }
  checkoutContext = "booking";
  activeBookingId = booking.id;
  updatePaymentSummary(price, values.service);
  const bookingConfirmation = document.getElementById("bookingConfirmation");
  bookingConfirmation.innerHTML = `<b>Appointment booked. Your demo ID is ${escapeHtml(booking.id)}.</b>${escapeHtml(values.service)} · ${escapeHtml(values.date)} at ${escapeHtml(values.time)}. View it any time in My Bookings below.`;
  bookingConfirmation.classList.remove("hidden");
  form.reset();
  setMinBookingDate();
  renderBookings();
  document.getElementById("paymentConfirmation").classList.add("hidden");
}

function renderBookings() {
  const bookings = getBookings();
  const list = document.getElementById("bookingList");
  const profile = readStorage(STORAGE_KEYS.profile, null);
  document.getElementById("dashboardGreeting").textContent = profile && profile.name ? `Welcome, ${profile.name}` : "Welcome, rider";
  if (!bookings.length) {
    list.innerHTML = '<div class="dashboard-empty"><span>✦</span><h3>Your next ride starts here.</h3><p>Book a service to see it appear in your garage.</p><a class="text-button" href="#booking">Book a service ↗</a></div>';
    return;
  }
  list.innerHTML = bookings.map((booking) => `
    <article class="booking-row">
      <div><h3>${escapeHtml(booking.service)}</h3><p>${escapeHtml(booking.brand)} ${escapeHtml(booking.model)} · ${escapeHtml(booking.registration)}</p><p>Booking ID: ${escapeHtml(booking.id)}</p></div>
      <div><b>${escapeHtml(booking.date)}</b><p>${escapeHtml(booking.time)}</p></div>
      <div><span class="booking-status ${booking.status === "Cancelled" ? "cancelled" : ""}">${escapeHtml(booking.status)}</span><p>Payment: ${escapeHtml(booking.paymentStatus)}</p></div>
      ${booking.status !== "Cancelled" ? `<button class="cancel-booking" data-cancel-booking="${escapeHtml(booking.id)}">Cancel appointment</button>` : '<span></span>'}
    </article>`).join("");
}

function cancelBooking(id) {
  const bookings = getBookings();
  const booking = bookings.find((item) => item.id === id);
  if (!booking || booking.status === "Cancelled") return;
  booking.status = "Cancelled";
  if (writeStorage(STORAGE_KEYS.bookings, bookings)) renderBookings();
}

function selectService(service) {
  const select = document.getElementById("bookingService");
  const option = [...select.options].find((item) => item.value === service || item.textContent === service);
  if (option) select.value = option.value;
  const price = servicePrices[select.value] || 0;
  checkoutContext = null;
  activeBookingId = null;
  updatePaymentSummary(price, select.value || "Workshop service", false);
}

function simulatePayment(event) {
  event.preventDefault();
  const total = Number(document.getElementById("paymentTotal").textContent.replace(/[^\d]/g, "")) || 0;
  if (!total || !checkoutContext) return;
  const method = new FormData(event.currentTarget).get("paymentMethod") || "UPI";
  const confirmation = document.getElementById("paymentConfirmation");
  const reference = `DEMO-${Date.now().toString(36).toUpperCase()}`;
  if (checkoutContext === "booking") {
    const bookings = getBookings();
    const booking = bookings.find((item) => item.id === activeBookingId && item.status !== "Cancelled");
    if (!booking) {
      showNotice(confirmation, "No active appointment is selected for payment. Please book a service first.", "payment-confirm");
      confirmation.classList.remove("hidden");
      return;
    }
    booking.paymentStatus = method === "Cash on Delivery" ? "Pay at workshop" : "Paid (demo)";
    if (!writeStorage(STORAGE_KEYS.bookings, bookings)) return;
    renderBookings();
    checkoutContext = null;
    activeBookingId = null;
    document.querySelector(".payment-submit").disabled = true;
  } else if (checkoutContext === "cart") {
    const payments = readStorage(STORAGE_KEYS.payments, []);
    payments.unshift({ id: reference, amount: total, method, createdAt: new Date().toISOString(), status: "Simulated" });
    if (!writeStorage(STORAGE_KEYS.payments, payments)) return;
    if (!writeStorage(STORAGE_KEYS.cart, [])) return;
    updateCart();
    checkoutContext = null;
    updatePaymentSummary(0, "Workshop service", false);
  }
  confirmation.innerHTML = `<b>Demo ${method === "Cash on Delivery" ? "checkout confirmed" : "payment simulated"}.</b>Reference: ${escapeHtml(reference)} · ${formatPrice(total)}. No real payment was processed.`;
  confirmation.classList.remove("hidden");
}

function openAuth(mode) {
  authMode = mode || "login";
  const modal = document.getElementById("authModal");
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setAuthMode(authMode);
  document.querySelector("#authForm [name=email]").focus();
}

function closeAuth() {
  document.getElementById("authModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  document.getElementById("authTitle").innerHTML = mode === "register" ? "Join the<br><em>ride.</em>" : "Welcome<br><em>back.</em>";
  document.getElementById("authNameWrap").classList.toggle("hidden", mode !== "register");
  document.getElementById("authSubmit").innerHTML = `${mode === "register" ? "Create demo profile" : "Login"} <span>↗</span>`;
  document.getElementById("authSuccess").classList.add("hidden");
  document.getElementById("authError").classList.add("hidden");
  document.querySelector("#authForm [name=password]").autocomplete = mode === "register" ? "new-password" : "current-password";
}

function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const currentProfile = readStorage(STORAGE_KEYS.profile, null);
  const success = document.getElementById("authSuccess");
  const error = document.getElementById("authError");
  success.classList.add("hidden");
  error.classList.add("hidden");

  if (authMode === "register") {
    if (!values.name || values.name.trim().length < 2) {
      showNotice(error, "Please enter your name to create a demo profile.", "form-error");
      return;
    }
    const profile = { name: values.name.trim(), email: values.email.trim().toLowerCase() };
    if (!writeStorage(STORAGE_KEYS.profile, profile)) {
      showNotice(error, "We couldn’t save your demo profile in this browser.", "form-error");
      return;
    }
    showNotice(success, "Your demo profile is ready. Welcome to the ride!", "form-success");
  } else {
    if (!currentProfile || currentProfile.email !== values.email.trim().toLowerCase()) {
      showNotice(error, "No demo profile found for that email. Choose Sign up to create one.", "form-error");
      return;
    }
    showNotice(success, `Welcome back, ${currentProfile.name}.`, "form-success");
  }
  renderBookings();
  window.setTimeout(closeAuth, 1000);
}

function initNavigation() {
  const toggle = document.getElementById("menuToggle");
  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Open navigation menu" : "Close navigation menu");
    document.getElementById("navLinks").classList.toggle("open", !isOpen);
  });
  document.querySelectorAll("#navLinks a").forEach((link) => link.addEventListener("click", closeMobileMenu));
}

function initFilters() {
  document.getElementById("serviceSearch").addEventListener("input", filterServices);
  document.getElementById("productSearch").addEventListener("input", filterProducts);
  document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    filterServices();
  }));
}

function initBookingAndPackages() {
  setMinBookingDate();
  document.getElementById("bookingForm").addEventListener("submit", submitBooking);
  document.querySelectorAll(".book-service").forEach((button) => button.addEventListener("click", () => {
    selectService(button.dataset.service);
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
    document.querySelector("#bookingForm [name=name]").focus({ preventScroll: true });
  }));
  document.querySelectorAll(".choose-package").forEach((button) => button.addEventListener("click", () => {
    selectService(button.dataset.package);
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
    document.querySelector("#bookingForm [name=name]").focus({ preventScroll: true });
  }));
  document.getElementById("bookingService").addEventListener("change", (event) => {
    if (event.target.value) selectService(event.target.value);
  });
}

function initCart() {
  updateCart();
  document.querySelectorAll(".add-cart").forEach((button) => button.addEventListener("click", () => addToCart(button)));
  document.getElementById("cartOpen").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  document.getElementById("cartBackdrop").addEventListener("click", closeCart);
  document.getElementById("cartItems").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (button) changeCartItem(button.dataset.id, button.dataset.cartAction);
  });
  document.getElementById("checkoutCart").addEventListener("click", () => {
    const total = getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!total) return;
    checkoutContext = "cart";
    updatePaymentSummary(total, "Your accessories");
    closeCart();
    document.getElementById("payment").scrollIntoView({ behavior: "smooth" });
  });
}

function initDashboard() {
  renderBookings();
  document.getElementById("bookingList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel-booking]");
    if (button) cancelBooking(button.dataset.cancelBooking);
  });
  document.getElementById("dashboardLogin").addEventListener("click", () => openAuth("login"));
}

function initAuth() {
  document.getElementById("loginOpen").addEventListener("click", () => openAuth("login"));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeAuth));
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  document.getElementById("authForm").addEventListener("submit", submitAuth);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
      closeAuth();
      closeMobileMenu();
    }
  });
}

function initPayment() {
  updatePaymentSummary(0, "Workshop service");
  document.getElementById("paymentForm").addEventListener("submit", simulatePayment);
}

function initContactAndNewsletter() {
  document.getElementById("contactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    form.reset();
    showNotice(document.getElementById("contactSuccess"), "Thanks for reaching out. This demo message has not been sent to a server.", "form-success");
  });
  document.getElementById("newsletterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const email = document.getElementById("newsletterEmail").value.trim().toLowerCase();
    const subscribers = readStorage(STORAGE_KEYS.newsletter, []);
    if (!subscribers.includes(email)) subscribers.push(email);
    if (writeStorage(STORAGE_KEYS.newsletter, subscribers)) {
      form.reset();
      document.getElementById("newsletterSuccess").classList.remove("hidden");
    }
  });
}

function initScrollControls() {
  const backTop = document.getElementById("backTop");
  window.addEventListener("scroll", () => backTop.classList.toggle("visible", window.scrollY > 500), { passive: true });
  backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initFilters();
  initBookingAndPackages();
  initCart();
  initDashboard();
  initAuth();
  initPayment();
  initContactAndNewsletter();
  initScrollControls();
});
