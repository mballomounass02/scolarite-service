document.querySelectorAll('input[type="file"]').forEach(input => {
  input.addEventListener("change", () => {
    const label = input.closest("label");
    if (label && input.files[0]) label.firstChild.textContent = input.files[0].name + " ";
  });
});
