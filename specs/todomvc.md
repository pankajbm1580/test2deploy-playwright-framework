# TodoMVC Test Plan

## Application Overview

Test plan for https://demo.playwright.dev/todomvc/ (React TodoMVC). Locators confirmed: input getByRole('textbox',{name:'What needs to be done?'}); items getByTestId('todo-item') (li, gets class "completed" when done); titles getByTestId('todo-title') (label); checkbox getByRole('checkbox',{name:'Toggle Todo'}); edit input getByRole('textbox',{name:'Edit'}) (appears on double-click); destroy button getByRole('button',{name:'Delete'}) (visible on hover); counter getByTestId('todo-count') (e.g. "1 item left" / "2 items left"); filter links getByRole('link',{name:'All'|'Active'|'Completed'}) with hashes #/, #/active, #/completed; getByRole('button',{name:'Clear completed'}). The list, counter and footer are not rendered when there are no todos. All scenarios start from a fresh page with an empty list.

## Test Scenarios

### 1. Add a todo

**Seed:** `e2e/seed.spec.ts`

#### 1.1. Add a single todo

**File:** `e2e/add-todo/add-single-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ with an empty list
    - expect: Input 'What needs to be done?' is visible and focused
    - expect: No todo-item elements; todo-count and filter links are not shown
  2. Fill the input with 'Buy milk' and press Enter
    - expect: One todo-item exists; its todo-title is 'Buy milk'
    - expect: 'Toggle Todo' checkbox is unchecked
    - expect: todo-count reads '1 item left'
    - expect: Input is cleared

#### 1.2. Add multiple todos and ignore empty input

**File:** `e2e/add-todo/add-multiple-and-empty.spec.ts`

**Steps:**
  1. Press Enter in the empty input, then type only spaces and press Enter
    - expect: No todo is created; list remains empty
  2. Add '  Buy milk  ' (with surrounding spaces), then 'Walk dog'
    - expect: Two todo-items in order: 'Buy milk' (whitespace trimmed), 'Walk dog'
    - expect: todo-count reads '2 items left'

### 2. Complete a todo

**Seed:** `e2e/seed.spec.ts`

#### 2.1. Mark a todo complete and uncomplete it

**File:** `e2e/complete-todo/toggle-todo.spec.ts`

**Steps:**
  1. Add todos 'Buy milk' and 'Walk dog'
    - expect: todo-count reads '2 items left'
  2. Check the 'Toggle Todo' checkbox of 'Buy milk'
    - expect: That todo-item has class 'completed' and checkbox is checked
    - expect: 'Walk dog' remains active
    - expect: todo-count reads '1 item left'
    - expect: 'Clear completed' button is visible
  3. Uncheck the same checkbox
    - expect: todo-item is no longer completed
    - expect: todo-count reads '2 items left'
    - expect: 'Clear completed' button is gone

#### 2.2. Complete all todos with 'Mark all as complete'

**File:** `e2e/complete-todo/mark-all-complete.spec.ts`

**Steps:**
  1. Add 'Buy milk' and 'Walk dog', then click the 'Mark all as complete' toggle (getByLabel('Mark all as complete'))
    - expect: Both todo-items are completed with checked checkboxes
    - expect: todo-count reads '0 items left'

### 3. Edit a todo

**Seed:** `e2e/seed.spec.ts`

#### 3.1. Edit a todo title and save with Enter

**File:** `e2e/edit-todo/edit-and-save.spec.ts`

**Steps:**
  1. Add 'Buy milk', then double-click its todo-title
    - expect: Textbox named 'Edit' appears with value 'Buy milk'
  2. Fill the Edit textbox with 'Buy oat milk' and press Enter
    - expect: Edit textbox disappears
    - expect: todo-title reads 'Buy oat milk'; still exactly one item
    - expect: todo-count reads '1 item left'

#### 3.2. Cancel edit with Escape and clearing text removes todo

**File:** `e2e/edit-todo/edit-cancel-and-clear.spec.ts`

**Steps:**
  1. Add 'Buy milk', double-click it, fill 'Changed', press Escape
    - expect: Title remains 'Buy milk'
  2. Double-click again, clear the Edit textbox, press Enter
    - expect: Todo is removed; list is empty

### 4. Delete a todo

**Seed:** `e2e/seed.spec.ts`

#### 4.1. Delete a todo via the destroy button

**File:** `e2e/delete-todo/delete-single.spec.ts`

**Steps:**
  1. Add 'Buy milk' and 'Walk dog'; hover over the 'Buy milk' todo-item
    - expect: 'Delete' button becomes visible on that item
  2. Click the 'Delete' button
    - expect: Only 'Walk dog' remains
    - expect: todo-count reads '1 item left'

#### 4.2. Delete the last remaining todo and clear completed

**File:** `e2e/delete-todo/delete-last-and-clear-completed.spec.ts`

**Steps:**
  1. Add 'Buy milk', hover and click 'Delete'
    - expect: List is empty; todo-count and filter links are hidden
  2. Add 'A' and 'B', complete 'A', click 'Clear completed'
    - expect: Only 'B' remains; todo-count reads '1 item left'

### 5. Filter active and completed todos

**Seed:** `e2e/seed.spec.ts`

#### 5.1. Filter by Active and Completed

**File:** `e2e/filter-todos/filter-active-completed.spec.ts`

**Steps:**
  1. Add 'Buy milk', 'Walk dog', 'Read book'; complete 'Walk dog'
    - expect: All view shows 3 items; todo-count '2 items left'
  2. Click the 'Active' link
    - expect: URL ends with #/active
    - expect: Only 'Buy milk' and 'Read book' shown (2 items)
    - expect: 'Active' link has class 'selected'
  3. Click the 'Completed' link
    - expect: URL ends with #/completed
    - expect: Only 'Walk dog' shown (1 item)
    - expect: 'Completed' link selected
  4. Click the 'All' link
    - expect: URL ends with #/ (or #/)
    - expect: All 3 items shown; counter still '2 items left'

#### 5.2. Filtered views update live when todos change

**File:** `e2e/filter-todos/filter-live-update.spec.ts`

**Steps:**
  1. Add 'Buy milk' and 'Walk dog', click 'Active', then check 'Buy milk'
    - expect: 'Buy milk' disappears from Active view; only 'Walk dog' shown; counter '1 item left'
  2. Click 'Completed'
    - expect: Only 'Buy milk' shown
  3. Uncheck 'Buy milk' in Completed view
    - expect: Completed view becomes empty; counter '2 items left'
